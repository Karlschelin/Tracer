// Avkodar videons ljudspår till mono i webbläsaren. Ger null om det saknas ljud eller inte går att avkoda.
import { mixToMono } from './audio';
import type { AudioTrack } from './types';

export async function decodeAudio(video: HTMLVideoElement): Promise<AudioTrack | null> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC || !video.currentSrc) return null;
  let ctx: AudioContext | null = null;
  try {
    // Filen finns redan lokalt (blob-adress), så det här hämtar inget över nätet.
    const data = await (await fetch(video.currentSrc)).arrayBuffer();
    ctx = new AC();
    const buf = await ctx.decodeAudioData(data);
    const channels: Float32Array[] = [];
    for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
    if (!channels.length || !buf.length) return null;
    return { samples: mixToMono(channels), sampleRate: buf.sampleRate };
  } catch {
    return null;
  } finally {
    void ctx?.close().catch(() => {});
  }
}
