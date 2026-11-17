// Web Worker för den tunga analysen, så att gränssnittet inte hackar medan appen letar efter träffen.
import { findAudioPeaks } from './audio';
import { findVanished } from './blobs';
import type { AudioTrack, Frame } from './types';

export type WorkerRequest =
  | { id: number; kind: 'audio'; track: AudioTrack }
  | { id: number; kind: 'vanished'; before: [Frame, Frame]; after: [Frame, Frame]; scale: number };
export type WorkerReply = { id: number; result?: unknown; error?: string };

const ctx = self as unknown as { postMessage(m: WorkerReply): void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };
ctx.onmessage = (e) => {
  const m = e.data;
  try {
    const result = m.kind === 'audio' ? findAudioPeaks(m.track) : findVanished(m.before, m.after, { scale: m.scale });
    ctx.postMessage({ id: m.id, result });
  } catch (err) {
    ctx.postMessage({ id: m.id, error: String(err) });
  }
};
