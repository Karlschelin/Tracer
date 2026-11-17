// Bildexakt stegning. Håller reda på vilken bildruta som faktiskt visas och söker på bildindex.
import { frameAtTime, frameCenterTime, frameCountOf, fpsFromMediaTimes } from './fps';

type RvfcMeta = { mediaTime: number };
type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: RvfcMeta) => void) => number;
};

export function hasFrameCallback(video: HTMLVideoElement): boolean {
  return typeof (video as RvfcVideo).requestVideoFrameCallback === 'function';
}

export class FrameClock {
  fps = 30;
  private mediaTime: number | null = null;
  private target: number | null = null;
  private readonly video: RvfcVideo;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    if (hasFrameCallback(video)) {
      const loop = (_now: number, meta: RvfcMeta) => {
        this.mediaTime = meta.mediaTime;
        this.video.requestVideoFrameCallback!(loop);
      };
      this.video.requestVideoFrameCallback!(loop);
    }
  }

  /** Nollställ när en ny video laddas. */
  reset(): void {
    this.mediaTime = null;
    this.target = null;
  }

  get frameCount(): number {
    return frameCountOf(this.video.duration || 0, this.fps);
  }

  /** Bildrutan som visas just nu (eller den vi är på väg till under en sökning). */
  get frame(): number {
    if (this.target != null) return this.target;
    const ct = this.video.currentTime;
    // mediaTime är den visade bildens tidsstämpel. Lita på den när den stämmer med spelhuvudet.
    if (this.mediaTime != null && Math.abs(this.mediaTime - ct) < 1.5 / this.fps) {
      return Math.max(0, Math.round(this.mediaTime * this.fps));
    }
    return Math.min(this.frameCount - 1, frameAtTime(ct, this.fps));
  }

  /** Starttiden för den visade bildrutan. */
  get frameTime(): number {
    return this.frame / this.fps;
  }

  /** Sök till en bildruta. Löftet uppfylls när rutan har visats. */
  seekToFrame(n: number): Promise<number> {
    const v = this.video;
    n = Math.max(0, Math.min(this.frameCount - 1, Math.round(n)));
    const t = Math.min(frameCenterTime(n, this.fps), Math.max(0, (v.duration || 0) - 0.001));
    if (this.target == null && !v.seeking && Math.abs(v.currentTime - t) < 1e-6) return Promise.resolve(n);
    this.target = n;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (this.target === n) this.target = null;
        resolve(n);
      };
      if (hasFrameCallback(v)) {
        // Vänta på just den begärda rutan. En bild från en tidigare sökning kan hinna visas först.
        const onFrame = (_now: number, meta: RvfcMeta) => {
          if (done) return;
          this.mediaTime = meta.mediaTime;
          if (Math.abs(meta.mediaTime - n / this.fps) < 0.5 / this.fps) finish();
          else v.requestVideoFrameCallback!(onFrame);
        };
        v.requestVideoFrameCallback!(onFrame);
      }
      // Reserv om ingen ny bild presenteras (äldre webbläsare, eller samma bild som redan visas).
      v.addEventListener('seeked', () => setTimeout(finish, hasFrameCallback(v) ? 150 : 0), { once: true });
      setTimeout(finish, 1500);
      v.currentTime = t;
    });
  }

  /** Stega ett antal bildrutor framåt eller bakåt. Snabba tryck i följd läggs ihop. */
  step(delta: number): Promise<number> {
    this.video.pause();
    return this.seekToFrame((this.target ?? this.frame) + delta);
  }
}

/**
 * Mäter bildfrekvensen genom att spela upp några bildrutor tyst och läsa deras tidsstämplar.
 * Returnerar null om webbläsaren saknar requestVideoFrameCallback eller inte får spela upp.
 */
export async function measureFps(video: HTMLVideoElement, frames = 16, timeoutMs = 3000): Promise<number | null> {
  const v = video as RvfcVideo;
  if (!hasFrameCallback(v)) return null;
  const times: number[] = [];
  const wasMuted = v.muted;
  v.muted = true;
  await new Promise<void>((resolve) => {
    let stop = false;
    const end = () => { if (!stop) { stop = true; clearTimeout(timer); resolve(); } };
    const timer = setTimeout(end, timeoutMs);
    const cb = (_now: number, meta: RvfcMeta) => {
      if (stop) return;
      times.push(meta.mediaTime);
      if (times.length >= frames) end(); else v.requestVideoFrameCallback!(cb);
    };
    v.requestVideoFrameCallback!(cb);
    v.play().catch(end);
  });
  v.pause();
  v.muted = wasMuted;
  return fpsFromMediaTimes(times);
}
