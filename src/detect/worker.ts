// Web Worker för den tunga analysen, så att gränssnittet inte hackar medan appen letar efter träffen.
import { findAudioPeaks } from './audio';
import { findVanished } from './blobs';
import { GAPS, frameCandidates, type Gray } from './candidates';
import type { AudioTrack, Frame } from './types';

export type WorkerRequest =
  | { id: number; kind: 'audio'; track: AudioTrack }
  | { id: number; kind: 'vanished'; before: [Frame, Frame]; after: [Frame, Frame]; scale: number }
  /** Lägger till en bild i spårningens fönster och tar fram kandidaterna för bildruta want (om satt). */
  | { id: number; kind: 'track'; frame: number; gray: Gray | null; want: number | null; reset: boolean };
export type WorkerReply = { id: number; result?: unknown; error?: string };

const ctx = self as unknown as { postMessage(m: WorkerReply): void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };
// Spårningens bilder. Workern håller dem själv, så att varje bild bara skickas hit en gång.
const window = new Map<number, Gray>();
const REACH = Math.max(...GAPS);

function track(m: Extract<WorkerRequest, { kind: 'track' }>) {
  if (m.reset) window.clear();
  if (m.gray) window.set(m.frame, m.gray);
  if (m.want == null) return [];
  const out = frameCandidates((k) => window.get(k), m.want);
  for (const k of window.keys()) if (k < m.want - REACH) window.delete(k);
  return out;
}

ctx.onmessage = (e) => {
  const m = e.data;
  try {
    const result = m.kind === 'audio' ? findAudioPeaks(m.track)
      : m.kind === 'track' ? track(m)
      : findVanished(m.before, m.after, { scale: m.scale });
    ctx.postMessage({ id: m.id, result });
  } catch (err) {
    ctx.postMessage({ id: m.id, error: String(err) });
  }
};
