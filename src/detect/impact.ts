// Automatisk träff: ljudtoppen ger kandidater, bilden bekräftar och bestämmer exakt bildruta.
// Utan användbart ljud söks hela klippet igenom i bilden. Inga DOM-beroenden.
import { findAudioPeaks } from './audio';
import { coreBrightness, fitBall, findVanished } from './blobs';
import type { AudioPeak, AudioTrack, Frame, FrameSource, ImpactResult, VanishCandidate } from './types';

/** Tung analys som kan köras i en Web Worker. Standard är att köra direkt. */
export interface Analysis {
  audioPeaks(track: AudioTrack): Promise<AudioPeak[]>;
  vanished(before: [Frame, Frame], after: [Frame, Frame], scale: number): Promise<VanishCandidate[]>;
}

export const directAnalysis: Analysis = {
  audioPeaks: async (track) => findAudioPeaks(track),
  vanished: async (before, after, scale) => findVanished(before, after, { scale }),
};

/** Ljudet från träffen hörs så här långt efter träffen i bilden (s). Uppmätt i samples/, se README där. */
export const AUDIO_LAG = 0.035;
/** Längsta sidan på bilderna som söks igenom. */
const ANALYSIS_SIDE = 960;
/** Lägsta poäng för att en fläck ska godtas som bollen. */
const MIN_SCORE = 0.2;

export interface DetectOptions {
  analysis?: Analysis;
  /** 0..1 och en kort text om vad som pågår. */
  onProgress?: (fraction: number, text: string) => void;
}

export async function detectImpact(source: FrameSource, audio: AudioTrack | null, opts: DetectOptions = {}): Promise<ImpactResult | null> {
  const analysis = opts.analysis ?? directAnalysis;
  const progress = opts.onProgress ?? (() => {});
  const { fps, frameCount } = source;
  const scale = Math.max(1, Math.max(source.width, source.height) / ANALYSIS_SIDE);
  const cache = new Map<number, Promise<Frame>>();
  const grab = (n: number) => {
    let p = cache.get(n);
    if (!p) { p = source.grab(n, ANALYSIS_SIDE); cache.set(n, p); }
    return p;
  };
  const frames = (t: number) => Math.max(1, Math.round(t * fps));

  /** Letar efter bollen som finns vid `lo` och är borta vid `hi` (bildrutor). */
  const look = async (lo: number, hi: number, gap = frames(0.1)): Promise<VanishCandidate | null> => {
    const b1 = lo - gap, a2 = hi + gap;
    if (b1 < 0 || a2 >= frameCount) return null;
    // Hämta i tur och ordning: videon kan bara söka till en bildruta i taget.
    const fb1 = await grab(b1), fb2 = await grab(lo), fa1 = await grab(hi), fa2 = await grab(a2);
    const found = await analysis.vanished([fb1, fb2], [fa1, fa2], scale);
    return found[0] ?? null;
  };

  const size = (d: number) => Math.round(Math.max(24, d * 4));
  const cropAt = (cx: number, cy: number, sz: number) => ({
    x: Math.round(Math.min(source.width - sz, Math.max(0, cx - sz / 2))),
    y: Math.round(Math.min(source.height - sz, Math.max(0, cy - sz / 2))),
  });

  /**
   * Prövar en kandidat i full upplösning. Mäter bollen noga och letar upp bildrutan där den försvinner.
   * En boll som slås iväg är borta från en bild till nästa. Sådant som bara gungar eller glider undan
   * (en bag, en fot) bleknar över flera bilder och underkänns.
   */
  const confirm = async (cand: VanishCandidate, from: number, to: number) => {
    const sz = size(cand.diameter);
    const c0 = cropAt(cand.x, cand.y, sz);
    const fit = fitBall(await source.crop(from, c0.x, c0.y, sz, sz), cand.diameter);
    if (!fit) return null;
    const ballPx = { x: c0.x + fit.x, y: c0.y + fit.y };
    const c = cropAt(ballPx.x, ballPx.y, sz);
    const core = async (n: number) =>
      coreBrightness(await source.crop(n, c.x, c.y, sz, sz), ballPx.x - c.x, ballPx.y - c.y, fit.diameter);
    const bright = await core(from), dark = await core(to);
    const range = bright - dark;
    if (range < Math.max(10, 0.1 * bright)) return null;
    // Halvera intervallet mellan "bollen ligger kvar" och "bollen är borta".
    let lo = from, hi = to, vLo = bright, vHi = dark;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1, v = await core(mid);
      if (v > dark + 0.5 * range) { lo = mid; vLo = v; } else { hi = mid; vHi = v; }
    }
    if (vLo < dark + 0.7 * range || vHi > dark + 0.3 * range) return null;
    return { frame: lo, ballPx, diameter: fit.diameter };
  };

  let hit: { frame: number; ballPx: { x: number; y: number }; diameter: number; peak: AudioPeak | null; score: number } | null = null;

  // 1. Ljudtoppar, starkast först. Den första som bilden bekräftar vinner.
  const peaks = audio ? await analysis.audioPeaks(audio) : [];
  for (let i = 0; i < peaks.length && !hit; i++) {
    progress(0.1 + 0.4 * (i / peaks.length), 'Lyssnar efter träffen…');
    const f = Math.round((peaks[i].time - AUDIO_LAG) * fps);
    const lo = f - frames(0.1), hi = f + frames(0.1);
    const cand = await look(lo, hi);
    if (!cand || cand.score < MIN_SCORE) continue;
    const ok = await confirm(cand, lo, hi);
    if (ok) hit = { ...ok, peak: peaks[i], score: cand.score };
  }

  // 2. Reserv: sök igenom klippet i bilden med jämna steg och pröva de tydligaste fläckarna först.
  if (!hit) {
    // Bilderna tas på ett jämnt rutnät (var 0,2 s), så att varje bild används i flera jämförelser.
    const step = frames(0.2);
    const found: { cand: VanishCandidate; lo: number; hi: number }[] = [];
    const starts: number[] = [];
    for (let lo = step; lo + 2 * step < frameCount; lo += step) starts.push(lo);
    for (let i = 0; i < starts.length; i++) {
      progress(0.1 + 0.6 * (i / starts.length), 'Letar efter bollen…');
      const lo = starts[i], hi = lo + step;
      const cand = await look(lo, hi, step);
      if (cand && cand.score >= MIN_SCORE) found.push({ cand, lo, hi });
    }
    found.sort((p, q) => q.cand.score - p.cand.score);
    for (const f of found.slice(0, 4)) {
      progress(0.8, 'Letar upp rätt bildruta…');
      const ok = await confirm(f.cand, f.lo, f.hi);
      if (ok) { hit = { ...ok, peak: null, score: f.cand.score }; break; }
    }
  }
  if (!hit) return null;
  const lo = hit.frame;

  // Träffen ligger mellan bild lo och lo+1. Ljudet säger var i intervallet, annars antas mitten.
  const t0 = lo / fps, t1 = (lo + 1) / fps;
  const impactTime = hit.peak ? Math.min(t1 - 0.001, Math.max(t0, hit.peak.time - AUDIO_LAG)) : (t0 + t1) / 2;
  progress(1, 'Klart');
  return {
    impactFrame: lo, impactTime, ballPx: hit.ballPx,
    ball: { x: hit.ballPx.x / source.width, y: hit.ballPx.y / source.height },
    diameter: hit.diameter,
    method: hit.peak ? 'ljud+bild' : 'bild',
    audioTime: hit.peak ? hit.peak.time : null,
    score: hit.score,
  };
}
