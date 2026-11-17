import { describe, expect, it } from 'vitest';
import { envelope, findAudioPeaks, mixToMono } from '../../src/detect/audio';
import { coreBrightness, findBlobs, findVanished, fitBall } from '../../src/detect/blobs';
import { detectImpact } from '../../src/detect/impact';
import type { AudioTrack, Frame, FrameSource } from '../../src/detect/types';

// ---------- Syntetiskt ljud ----------
function track(seconds: number, clicks: [number, number][], noise = 0.003, sampleRate = 48000): AudioTrack {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  let seed = 1;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  for (let i = 0; i < samples.length; i++) samples[i] = rnd() * noise;
  for (const [t, amp] of clicks) {
    const start = Math.round(t * sampleRate);
    for (let i = 0; i < sampleRate * 0.03 && start + i < samples.length; i++) {
      samples[start + i] += amp * Math.exp(-i / (sampleRate * 0.006)) * Math.sin(i * 0.9);
    }
  }
  return { samples, sampleRate };
}

describe('ljudtoppar', () => {
  it('hittar klicket och när det börjar', () => {
    const peaks = findAudioPeaks(track(5, [[1.74, 0.8]]));
    expect(peaks).toHaveLength(1);
    expect(peaks[0].time).toBeGreaterThan(1.735);
    expect(peaks[0].time).toBeLessThan(1.745);
  });

  it('ordnar flera toppar efter styrka och håller isär dem', () => {
    const peaks = findAudioPeaks(track(5, [[1.0, 0.3], [2.5, 0.9], [2.52, 0.5], [4.0, 0.6]]));
    expect(peaks.map((p) => Math.round(p.time * 10) / 10)).toEqual([2.5, 4.0, 1.0]);
  });

  it('ger inga toppar i tystnad eller jämnt brus', () => {
    expect(findAudioPeaks(track(3, [], 0))).toEqual([]);
    expect(findAudioPeaks(track(3, [], 0.05))).toEqual([]);
    expect(findAudioPeaks({ samples: new Float32Array(0), sampleRate: 48000 })).toEqual([]);
  });

  it('mixar till mono och räknar styrka per fönster', () => {
    const mono = mixToMono([Float32Array.of(1, 0, 1), Float32Array.of(0, 0, 1)]);
    expect(Array.from(mono)).toEqual([0.5, 0, 1]);
    const { env, hop } = envelope({ samples: new Float32Array(480).fill(0.5), sampleRate: 48000 }, 0.002);
    expect(hop).toBeCloseTo(0.002, 6);
    expect(env).toHaveLength(5);
    expect(env[0]).toBeCloseTo(0.5, 5);
  });
});

// ---------- Syntetiska bilder ----------
type Paint = (x: number, y: number) => [number, number, number] | null;
function image(width: number, height: number, layers: Paint[], bg: [number, number, number] = [40, 110, 50]): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = bg;
      for (const l of layers) c = l(x, y) ?? c;
      data.set([c[0], c[1], c[2], 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}
const disc = (cx: number, cy: number, r: number, color: [number, number, number] = [235, 235, 235]): Paint =>
  (x, y) => (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r ? color : null);
const rect = (x0: number, y0: number, w: number, h: number, color: [number, number, number]): Paint =>
  (x, y) => (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h ? color : null);

describe('bollen vid uppställning', () => {
  const W = 240, H = 320;
  const shoe = rect(40, 250, 50, 18, [240, 240, 240]);

  it('hittar den runda vita fläcken som försvinner', () => {
    const before = image(W, H, [shoe, disc(120.5, 260.5, 4)]);
    const after = image(W, H, [shoe]);
    const found = findVanished([before, before], [after, after], { scale: 4 });
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(120.5 * 4, 0);
    expect(found[0].y).toBeCloseTo(260.5 * 4, 0);
    expect(found[0].diameter).toBeGreaterThan(26);
    expect(found[0].diameter).toBeLessThan(38);
    expect(found[0].score).toBeGreaterThan(0.6);
  });

  it('godtar inte en fläck som är för stor för att vara en boll', () => {
    const before = image(W, H, [disc(120, 260, 9)]);
    const after = image(W, H, []);
    expect(findVanished([before, before], [after, after], { scale: 1 })).toEqual([]);
  });

  it('bryr sig inte om sådant som rör sig eller ligger kvar', () => {
    // En vit fläck som flyttar sig mellan före-bilderna (klubbhuvud) och en boll som ligger kvar.
    const b1 = image(W, H, [disc(60, 200, 4), disc(120, 260, 4)]);
    const b2 = image(W, H, [disc(90, 200, 4), disc(120, 260, 4)]);
    const a = image(W, H, [disc(120, 260, 4)]);
    expect(findVanished([b1, b2], [a, a], { scale: 1 })).toEqual([]);
  });

  it('väljer bollen framför en skokant och en avlång fläck', () => {
    const before = image(W, H, [shoe, disc(120, 260, 4), rect(180, 255, 30, 4, [235, 235, 235])]);
    // Efteråt har skon flyttat sig lite, så en smal kant av den "försvinner" också.
    const after = image(W, H, [rect(46, 250, 44, 18, [240, 240, 240])]);
    const found = findVanished([before, before], [after, after], { scale: 1 });
    expect(Math.round(found[0].x)).toBe(120);
    expect(Math.round(found[0].y)).toBe(260);
  });

  it('klarar en mörk och kontrastfattig film', () => {
    const before = image(W, H, [disc(120, 260, 4, [120, 120, 120])], [40, 60, 45]);
    const after = image(W, H, [], [40, 60, 45]);
    const found = findVanished([before, before], [after, after], { scale: 1 });
    expect(found).toHaveLength(1);
    expect(found[0].score).toBeGreaterThan(0.5);
  });

  it('mäter bollens mitt och storlek i ett utsnitt', () => {
    const crop = image(96, 96, [disc(50.3, 45.7, 14)]);
    const fit = fitBall(crop, 28)!;
    expect(fit.x).toBeCloseTo(50.3, 0);
    expect(fit.y).toBeCloseTo(45.7, 0);
    expect(fit.diameter).toBeCloseTo(28, 0);
    expect(coreBrightness(crop, fit.x, fit.y, fit.diameter)).toBeGreaterThan(230);
    expect(fitBall(image(96, 96, []), 28)).toBeNull();
  });

  it('delar upp en bild i sammanhängande områden', () => {
    const v = Float32Array.from([1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
    const blobs = findBlobs(v, 4, 3, 0.5);
    expect(blobs.map((b) => b.area).sort()).toEqual([2, 2]);
  });
});

// ---------- Hela kedjan på en syntetisk film ----------
function movie(o: { impact: number; frames?: number; fps?: number; ball?: [number, number]; sway?: boolean }): FrameSource {
  const W = 480, H = 640, fps = o.fps ?? 30, frameCount = o.frames ?? 120;
  const [bx, by] = o.ball ?? [240.5, 500.5];
  const cache = new Map<number, Frame>();
  const render = (n: number): Frame => {
    let f = cache.get(n);
    if (!f) { f = paint(n); cache.set(n, f); }
    return f;
  };
  const paint = (n: number): Frame => {
    const layers: Paint[] = [rect(100, 480, 60, 20, [240, 240, 240])];
    // En grå fläck som bleknar långsamt (en gungande bag): ska inte tas för en träff.
    if (o.sway) {
      const k = Math.min(1, Math.max(0, (n - 60) / 12));
      layers.push(disc(380, 520, 7, [200 - 150 * k, 200 - 100 * k, 200 - 150 * k]));
    }
    if (n <= o.impact) layers.push(disc(bx, by, 7));
    // Klubban sveper förbi runt träffen och bollen flyger iväg uppåt.
    if (Math.abs(n - o.impact) <= 1) layers.push(rect(bx - 40 + (n - o.impact) * 30, by - 30, 10, 26, [180, 180, 190]));
    if (n > o.impact) layers.push(disc(bx + 2 * (n - o.impact), by - 60 * (n - o.impact), 5));
    return image(W, H, layers);
  };
  return {
    width: W, height: H, fps, frameCount,
    grab: async (n, maxSide) => { expect(maxSide).toBeGreaterThanOrEqual(640); return render(n); },
    crop: async (n, x, y, w, h) => {
      const f = render(n);
      const data = new Uint8ClampedArray(w * h * 4);
      for (let r = 0; r < h; r++) data.set(f.data.subarray(((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4), r * w * 4);
      return { width: w, height: h, data };
    },
  };
}

describe('träffdetektering', () => {
  it('ljudtoppen bekräftas i bilden och ger exakt bildruta', async () => {
    const r = (await detectImpact(movie({ impact: 47 }), track(4, [[47.6 / 30 + 0.035, 0.8]])))!;
    expect(r.method).toBe('ljud+bild');
    expect(r.impactFrame).toBe(47);
    expect(r.ballPx.x).toBeCloseTo(240.5, 0);
    expect(r.ballPx.y).toBeCloseTo(500.5, 0);
    expect(r.impactTime).toBeCloseTo(47.6 / 30, 2);
  });

  it('en starkare ljudtopp utan boll i bilden väljs bort', async () => {
    const audio = track(4, [[47.5 / 30 + 0.035, 0.5], [2.6, 0.9]]);
    const r = (await detectImpact(movie({ impact: 47, sway: true }), audio))!;
    expect(r.method).toBe('ljud+bild');
    expect(r.impactFrame).toBe(47);
    expect(r.audioTime).toBeCloseTo(47.5 / 30 + 0.035, 2);
  });

  it('utan ljud hittas träffen i bilden', async () => {
    for (const impact of [20, 51, 83]) {
      const r = (await detectImpact(movie({ impact, sway: true }), null))!;
      expect(r.method).toBe('bild');
      expect(r.impactFrame).toBe(impact);
      expect(r.impactTime).toBeCloseTo((impact + 0.5) / 30, 5);
    }
  }, 120_000);

  it('fungerar i 60 bilder per sekund', async () => {
    const r = (await detectImpact(movie({ impact: 95, fps: 60, frames: 240 }), track(4, [[95.3 / 60 + 0.035, 0.8]])))!;
    expect(r.impactFrame).toBe(95);
  });

  it('ger null när det inte finns någon träff', async () => {
    expect(await detectImpact(movie({ impact: 9999 }), track(4, [[2, 0.8]]))).toBeNull();
    expect(await detectImpact(movie({ impact: -5 }), null)).toBeNull();
  });
});
