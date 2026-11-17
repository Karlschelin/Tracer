// Mäter träffdetekteringen mot facit i samples/. Bilderna läses med ffmpeg, så testet hoppas över utan ffmpeg.
// Samma mätning görs i webbläsaren i tests/e2e/detect.spec.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ballAt, facitFileName, parseFacit } from '../../src/annotate/facit';
import { detectImpact } from '../../src/detect/impact';
import { ffmpegAudio, ffmpegSource, hasFfmpeg } from './ffmpeg';

const dir = join(import.meta.dirname, '../../samples');
const clips = readdirSync(dir).filter((f) => /\.(mov|mp4)$/i.test(f) && existsSync(join(dir, facitFileName(f))));

describe.skipIf(!hasFfmpeg())('träffdetektering mot facit', () => {
  for (const clip of clips) {
    const facit = parseFacit(JSON.parse(readFileSync(join(dir, facitFileName(clip)), 'utf8')));
    const rest = ballAt(facit, facit.impactFrame!)!;
    for (const withAudio of [true, false]) {
      it(`${clip} ${withAudio ? 'med ljud' : 'utan ljud (bara bild)'}`, async () => {
        const src = ffmpegSource(join(dir, clip));
        const r = await detectImpact(src, withAudio ? ffmpegAudio(join(dir, clip)) : null);
        expect(r, 'ingen träff hittades').not.toBeNull();
        const dFrame = r!.impactFrame - facit.impactFrame!;
        const dPx = Math.hypot(r!.ballPx.x - rest.x * facit.width, r!.ballPx.y - rest.y * facit.height);
        console.log(`${clip} ${withAudio ? 'ljud+bild' : 'bara bild'}: träffbild ${r!.impactFrame} (facit ${facit.impactFrame}, fel ${dFrame}), ` +
          `boll ${r!.ballPx.x.toFixed(1)},${r!.ballPx.y.toFixed(1)} (fel ${dPx.toFixed(1)} px), metod ${r!.method}, poäng ${r!.score.toFixed(2)}, ${src.grabs} bildhämtningar`);
        expect(r!.method).toBe(withAudio ? 'ljud+bild' : 'bild');
        // Kraven i fas 2: träffen inom ±2 bildrutor och bollen inom 10 px.
        expect(Math.abs(dFrame)).toBeLessThanOrEqual(2);
        expect(dPx).toBeLessThanOrEqual(10);
        expect(r!.impactTime).toBeGreaterThanOrEqual(r!.impactFrame / src.fps);
        expect(r!.impactTime).toBeLessThanOrEqual((r!.impactFrame + 1) / src.fps);
      }, 300_000);
    }

    it(`${clip}: en starkare falsk ljudtopp väljs bort av bilden`, async () => {
      const file = join(dir, clip);
      const audio = ffmpegAudio(file)!;
      // Lägg in ett klick som är starkare än träffen, en sekund efter den.
      const t = (facit.impactFrame! + 30) / 30;
      for (let i = 0; i < 1440; i++) audio.samples[Math.round(t * audio.sampleRate) + i] += 1.5 * Math.exp(-i / 300) * Math.sin(i * 0.9);
      const r = await detectImpact(ffmpegSource(file), audio);
      expect(r?.method).toBe('ljud+bild');
      expect(r?.impactFrame).toBe(facit.impactFrame);
    }, 300_000);
  }
});
