// Mäter den automatiska bollspårningen mot facit i samples/: först träffen (fas 2), sedan banan (fas 3).
// Skriver ut medelfelet per klipp. Bilderna läses med ffmpeg, så testet hoppas över utan ffmpeg.
// Kör: npm run measure:track
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { facitFileName, parseFacit } from '../../src/annotate/facit';
import { detectImpact } from '../../src/detect/impact';
import { trackBall } from '../../src/detect/track';
import { shotError } from '../../src/trajectory/fit';
import { ffmpegAudio, ffmpegSequentialSource, ffmpegSource, hasFfmpeg } from './ffmpeg';

const dir = join(import.meta.dirname, '../../samples');
const clips = readdirSync(dir).filter((f) => /\.(mov|mp4)$/i.test(f) && existsSync(join(dir, facitFileName(f))));
/** Målet i uppdraget: medelfelet under ca 3 % av bildhöjden. */
const LIMIT = 0.03;

describe.skipIf(!hasFfmpeg())('bollspårning mot facit', () => {
  for (const clip of clips) {
    it(clip, async () => {
      const file = join(dir, clip);
      const facit = parseFacit(JSON.parse(readFileSync(join(dir, facitFileName(clip)), 'utf8')));
      const impact = await detectImpact(ffmpegSource(file), ffmpegAudio(file));
      expect(impact, 'ingen träff').not.toBeNull();
      const src = ffmpegSequentialSource(file);
      const t0 = performance.now();
      const r = await trackBall(src, impact!.impactFrame, impact!.ball);
      const ms = performance.now() - t0;
      expect(r, 'ingen bana').not.toBeNull();
      const aspect = facit.width / facit.height;
      const flight = facit.ball.filter((b) => b.frame > facit.impactFrame!);
      const errs = flight.map((b) => shotError(r!.shot, { t: (b.frame + 0.5) / facit.fps, x: b.x, y: b.y }, aspect));
      const mean = errs.reduce((a, b) => a + b, 0) / errs.length, max = Math.max(...errs);
      // Felet där bollen syns i spåret och där banan är extrapolerad, var för sig.
      const seen = new Set(r!.points.map((p) => p.frame));
      const inTrack = errs.filter((_, i) => seen.has(flight[i].frame));
      const extra = errs.filter((_, i) => !seen.has(flight[i].frame));
      const avg = (v: number[]) => (v.length ? (100 * v.reduce((a, b) => a + b, 0)) / v.length : NaN);
      const s = r!.shot;
      console.log(`${clip}: medelfel ${(100 * mean).toFixed(2)} % av bildhöjden (${(mean * facit.height).toFixed(0)} px), ` +
        `störst ${(100 * max).toFixed(2)} %, ${flight.length} facitpunkter; ` +
        `i spåret ${avg(inTrack).toFixed(2)} % (${inTrack.length}), extrapolerat ${avg(extra).toFixed(2)} % (${extra.length}); ` +
        `${r!.points.length} spårpunkter t.o.m. bild ${r!.points[r!.points.length - 1].frame}, säkerhet ${r!.confidence.toFixed(2)}, ` +
        `flygtid ${s.flight.toFixed(2)} s, topp vid ${(100 * s.apexFrac).toFixed(0)} %, perspektiv ${s.perspective.toFixed(1)}, ` +
        `${(ms / 1000).toFixed(1)} s`);
      expect(mean).toBeLessThan(LIMIT);
    }, 600_000);
  }
});
