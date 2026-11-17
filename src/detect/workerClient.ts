// Kör analysen i en Web Worker. Går det inte att starta en worker körs samma funktioner direkt.
import { directAnalysis, type Analysis } from './impact';
import type { AudioPeak, VanishCandidate } from './types';
import DetectWorker from './worker?worker&inline';
import type { WorkerReply, WorkerRequest } from './worker';

type Req = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

export function createAnalysis(): Analysis & { usesWorker: boolean; dispose(): void } {
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
    dispose: () => { worker?.terminate(); worker = null; },
  };
}
