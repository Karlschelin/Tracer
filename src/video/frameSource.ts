// Bildrutor ur videoelementet för bildanalysen: sök till rutan, rita den på en canvas och läs pixlarna.
import type { Frame, FrameSource } from '../detect/types';
import type { FrameClock } from './frameClock';

export function videoFrameSource(video: HTMLVideoElement, clock: FrameClock): FrameSource {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const width = video.videoWidth, height = video.videoHeight;
  const read = (w: number, h: number, draw: () => void): Frame => {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    draw();
    const img = ctx.getImageData(0, 0, w, h);
    return { width: w, height: h, data: img.data };
  };
  return {
    width, height, fps: clock.fps, frameCount: clock.frameCount,
    async grab(frame, maxSide) {
      await clock.seekToFrame(frame);
      const k = Math.min(1, maxSide / Math.max(width, height));
      const w = Math.round(width * k), h = Math.round(height * k);
      return read(w, h, () => ctx.drawImage(video, 0, 0, w, h));
    },
    async crop(frame, x, y, w, h) {
      await clock.seekToFrame(frame);
      return read(w, h, () => ctx.drawImage(video, x, y, w, h, 0, 0, w, h));
    },
  };
}
