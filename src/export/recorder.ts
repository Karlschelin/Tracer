// Inspelning av video + linje till en fil med MediaRecorder (mp4 i Safari, webm i Chrome).

export interface RecordOptions {
  video: HTMLVideoElement;
  /** Videons storlek i pixlar. */
  vw: number;
  vh: number;
  fps: number;
  withAudio: boolean;
  /** Frys sista bilden tills linjen är färdigritad. */
  holdEnd: boolean;
  /** Tiden (s) då linjen är klar, inklusive lite marginal. */
  traceEnd: number;
  /** Ritar linjen ovanpå videobilden vid tiden t. */
  drawOverlay: (ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => void;
  onProgress: (fraction: number) => void;
}

export interface RecordResult {
  blob: Blob;
  type: string;
  /** Filändelse: "mp4" eller "webm". */
  ext: string;
  width: number;
  height: number;
}

export function canRecord(): boolean {
  return typeof window.MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

export function pickMime(): string {
  const list = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

/** Exportens storlek: längsta sidan högst 1920 px, jämna mått. */
export function exportSize(vw: number, vh: number): { W: number; H: number } {
  const scale = Math.min(1, 1920 / Math.max(vw, vh));
  return { W: Math.round((vw * scale) / 2) * 2, H: Math.round((vh * scale) / 2) * 2 };
}

let audioCtx: AudioContext | null = null;
let audioDest: MediaStreamAudioDestinationNode | null = null;
function audioTracks(video: HTMLVideoElement): MediaStreamTrack[] {
  if (!audioCtx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AC();
    const src = audioCtx.createMediaElementSource(video);
    audioDest = audioCtx.createMediaStreamDestination();
    src.connect(audioDest); src.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioDest!.stream.getAudioTracks();
}

const seek = (video: HTMLVideoElement, t: number) => new Promise<void>((res) => {
  video.addEventListener('seeked', () => res(), { once: true });
  video.currentTime = t;
});

export async function recordVideo(o: RecordOptions): Promise<RecordResult> {
  const { video } = o;
  const { W, H } = exportSize(o.vw, o.vh);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const stream = c.captureStream(Math.min(60, o.fps));
  if (o.withAudio) {
    try { audioTracks(video).forEach((t) => stream.addTrack(t)); } catch { /* exportera utan ljud */ }
  }
  const mime = pickMime();
  const opts: MediaRecorderOptions = { videoBitsPerSecond: 12e6 };
  if (mime) opts.mimeType = mime;
  const rec = new MediaRecorder(stream, opts);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });

  video.pause();
  await seek(video, 0);
  const draw = (t: number) => { ctx.drawImage(video, 0, 0, W, H); o.drawOverlay(ctx, W, H, t); };
  draw(0);
  rec.start(250);
  await video.play();
  const dur = video.duration;
  const total = o.holdEnd ? Math.max(dur, o.traceEnd) : dur;
  await new Promise<void>((resolve) => {
    let holdStart: number | null = null;
    const tick = () => {
      if (!video.ended) {
        draw(video.currentTime);
        o.onProgress(video.currentTime / total);
        requestAnimationFrame(tick);
        return;
      }
      if (o.holdEnd && dur < o.traceEnd) {
        if (holdStart == null) holdStart = performance.now();
        const t = dur + (performance.now() - holdStart) / 1000;
        draw(t); o.onProgress(t / total);
        if (t < o.traceEnd) { requestAnimationFrame(tick); return; }
      } else {
        draw(dur);
      }
      resolve();
    };
    tick();
  });
  rec.stop();
  await stopped;
  const type = rec.mimeType || mime || 'video/webm';
  return { blob: new Blob(chunks, { type }), type, ext: type.includes('mp4') ? 'mp4' : 'webm', width: W, height: H };
}
