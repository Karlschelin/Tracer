import { describe, expect, it } from 'vitest';
import { fpsFromMediaTimes, frameAtTime, frameCenterTime, frameCountOf, snapFps } from '../../src/video/fps';

const series = (fps: number, n: number, skip: number[] = []) =>
  Array.from({ length: n }, (_, i) => i).filter((i) => !skip.includes(i)).map((i) => i / fps);

describe('bildfrekvens', () => {
  it('läser av vanliga bildfrekvenser', () => {
    for (const fps of [24, 25, 30, 60, 120, 240]) expect(fpsFromMediaTimes(series(fps, 16))).toBe(fps);
    expect(fpsFromMediaTimes(series(30000 / 1001, 16))).toBe(29.97);
    expect(fpsFromMediaTimes(series(60000 / 1001, 16))).toBe(59.94);
  });

  it('tål tappade bilder och dubbletter', () => {
    expect(fpsFromMediaTimes(series(30, 20, [3, 4, 9, 15]))).toBe(30);
    expect(fpsFromMediaTimes([0, 0, 1 / 30, 1 / 30, 2 / 30, 3 / 30, 4 / 30])).toBe(30);
  });

  it('tål mikrosekundavrundade tidsstämplar', () => {
    const t = series(30, 16).map((v) => Math.round(v * 1e6) / 1e6);
    expect(fpsFromMediaTimes(t)).toBe(30);
  });

  it('ger null när underlaget är för litet', () => {
    expect(fpsFromMediaTimes([])).toBeNull();
    expect(fpsFromMediaTimes([0, 1 / 30, 2 / 30])).toBeNull();
  });

  it('behåller ovanliga bildfrekvenser', () => {
    expect(snapFps(37.5)).toBe(37.5);
    expect(snapFps(30.1)).toBe(30);
  });

  it('räknar om mellan tid och bildindex', () => {
    for (const fps of [29.97, 30, 60, 240]) {
      for (const n of [0, 1, 51, 204, 999]) {
        expect(frameAtTime(frameCenterTime(n, fps), fps)).toBe(n);
        expect(frameAtTime(n / fps, fps)).toBe(n);
      }
    }
    expect(frameCountOf(6.833333, 30)).toBe(205);
    expect(frameCountOf(4.033333, 30)).toBe(121);
  });
});
