// Kör analysen i en Web Worker. Går det inte att starta en worker körs samma funktioner direkt.
import { directAnalysis, type Analysis } from './impact';
import { frameCandidates, type Candidate, type Gray } from './candidates';
import type { AudioPeak, VanishCandidate } from './types';
import DetectWorker from './worker?worker&inline';
import type { WorkerReply, WorkerRequest } from './worker';

type Req = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

/** Kandidatsökningen för bollspårningen, i workern om den finns. Se trackBall(). */
export type TrackCandidates = (window: Map<number, Gray>, n: number) => Promise<Candidate[]>;

export function createAnalysis(): Analysis & { usesWorker: boolean; dispose(): void; trackCandidates: TrackCandidates } {
  let worker: Worker | null = null;
  try { worker = new DetectWorker(); } catch { worker = null; }
  let next = 1;
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const fail = (why: string) => {
    for (const w of waiting.values()) w.reject(new Error(why));
    waiting.clear();
    worker?.terminate();
    worker = null;
  };
  if (worker) {
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error) w.reject(new Error(e.data.error)); else w.resolve(e.data.result);
    };
    worker.onerror = () => fail('worker');
  }
  /** Skickar till workern. Om den inte går att använda körs reserven direkt i stället. */
  const call = async <T>(req: Req, direct: () => Promise<T>): Promise<T> => {
    if (!worker) return direct();
    try {
      return await new Promise<T>((resolve, reject) => {
        const id = next++;
        waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
        worker!.postMessage({ id, ...req } as WorkerRequest);
      });
    } catch {
      return direct();
    }
  };
  return {
    get usesWorker() { return worker != null; },
    audioPeaks: (track) => call<AudioPeak[]>({ kind: 'audio', track }, () => directAnalysis.audioPeaks(track)),
    vanished: (before, after, scale) =>
      call<VanishCandidate[]>({ kind: 'vanished', before, after, scale }, () => directAnalysis.vanished(before, after, scale)),
    trackCandidates: (() => {
      // Skickar bara de bilder som workern inte redan har.
      let sent = -1;
      return async (window, n) => {
        const direct = async () => frameCandidates((k) => window.get(k), n);
        if (!worker) return direct();
        const reset = sent < 0;
        const keys = [...window.keys()].filter((k) => k > sent).sort((a, b) => a - b);
        for (let i = 0; i < keys.length; i++) {
          const last = i === keys.length - 1;
          const gray = window.get(keys[i])!;
          // Kopia, så att bilden finns kvar här om workern skulle sluta fungera.
          const copy = { width: gray.width, height: gray.height, data: gray.data.slice() };
          const res = await call<Candidate[]>(
            { kind: 'track', frame: keys[i], gray: copy, want: last ? n : null, reset: reset && i === 0 },
            direct);
          sent = keys[i];
          if (last) return res;
        }
        return call<Candidate[]>({ kind: 'track', frame: n, gray: null, want: n, reset: false }, direct);
      };
    })(),
    dispose: () => { worker?.terminate(); worker = null; },
  };
}
