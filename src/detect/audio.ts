// Hitta klickljudet från träffen i ljudspåret. Rena funktioner.
import type { AudioPeak, AudioTrack } from './types';

/** Slår ihop kanaler till mono. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] / channels.length;
  return out;
}

/** Ljudets styrka (RMS) i korta fönster. hop är fönstrets längd i sekunder. */
export function envelope(track: AudioTrack, hop = 0.002): { env: Float32Array; hop: number } {
  const w = Math.max(1, Math.round(track.sampleRate * hop));
  const n = Math.floor(track.samples.length / w);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * w;
    for (let j = 0; j < w; j++) { const v = track.samples[o + j]; s += v * v; }
    env[i] = Math.sqrt(s / w);
  }
  return { env, hop: w / track.sampleRate };
}

/**
 * De starkaste korta ljudtopparna, starkast först. Tiden är när ljudet börjar
 * (första fönstret strax före toppen som når 30 % av toppens styrka), inte när det är som starkast.
 */
export function findAudioPeaks(track: AudioTrack, max = 6, minGap = 0.08): AudioPeak[] {
  const { env, hop } = envelope(track);
  if (!env.length) return [];
  const sorted = Float32Array.from(env).sort();
  const floor = sorted[sorted.length >> 1];
  const order = Array.from(env.keys()).sort((a, b) => env[b] - env[a]);
  const peaks: { i: number; v: number }[] = [];
  for (const i of order) {
    // En topp ska sticka ut tydligt ur bakgrundsljudet.
    if (env[i] < Math.max(0.02, floor * 4)) break;
    if (peaks.every((p) => Math.abs(p.i - i) * hop >= minGap)) peaks.push({ i, v: env[i] });
    if (peaks.length >= max) break;
  }
  return peaks.map(({ i, v }) => {
    let k = i;
    const back = Math.round(0.02 / hop);
    while (k > 0 && i - k < back && env[k - 1] >= 0.3 * v) k--;
    return { time: k * hop, strength: v };
  });
}
