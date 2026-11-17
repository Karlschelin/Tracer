// Hjälp för tester som läser klippen i samples/ med ffmpeg i stället för en webbläsare.
import { execFileSync, spawnSync } from 'node:child_process';
import type { AudioTrack, Frame, FrameSource } from '../../src/detect/types';

export const hasFfmpeg = (): boolean => spawnSync('ffmpeg', ['-version']).status === 0;

function probe(file: string) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,r_frame_rate,nb_frames:stream_side_data=rotation', '-of', 'json', file]).toString();
  const s = JSON.parse(out).streams[0];
  const rot = Number(s.side_data_list?.find((d: { rotation?: number }) => d.rotation != null)?.rotation ?? 0);
  const swap = Math.abs(rot) % 180 === 90;
  const [num, den] = s.r_frame_rate.split('/').map(Number);
  return { width: swap ? s.height : s.width, height: swap ? s.width : s.height, fps: num / den, frameCount: Number(s.nb_frames) };
}

/** Bildrutor ur en videofil. Samma bildindex som i appen (mätt i e2e-testerna). */
export function ffmpegSource(file: string): FrameSource & { grabs: number } {
  const meta = probe(file);
  const read = (frame: number, filter: string, w: number, h: number): Frame => {
    // -ss före -i söker exakt: första bildrutan med tid >= (n - 0,25)/fps är bildruta n.
    const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(Math.max(0, (frame - 0.25) / meta.fps)), '-i', file,
      '-vf', filter, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 });
    if (buf.length !== w * h * 4) throw new Error(`ffmpeg gav ${buf.length} byte för bild ${frame}, väntade ${w * h * 4}`);
    return { width: w, height: h, data: new Uint8Array(buf) };
  };
  const src = {
    ...meta, grabs: 0,
    async grab(frame: number, maxSide: number) {
      src.grabs++;
      const k = Math.min(1, maxSide / Math.max(meta.width, meta.height));
      const w = Math.round(meta.width * k), h = Math.round(meta.height * k);
      return read(frame, `scale=${w}:${h}:flags=bilinear`, w, h);
    },
    async crop(frame: number, x: number, y: number, w: number, h: number) {
      src.grabs++;
      return read(frame, `format=rgba,crop=${w}:${h}:${x}:${y}:exact=1`, w, h);
    },
  };
  return src;
}

export function ffmpegAudio(file: string, sampleRate = 48000): AudioTrack | null {
  try {
    const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    return { samples: new Float32Array(buf.buffer, buf.byteOffset, buf.length >> 2).slice(), sampleRate };
  } catch { return null; }
}

/**
 * Som ffmpegSource, men grab() avkodar 30 bildrutor i följd per anrop till ffmpeg och sparar dem.
 * Mycket snabbare när bilderna läses i ordning, som i bollspårningen.
 */
export function ffmpegSequentialSource(file: string, chunk = 30): FrameSource & { grabs: number } {
  const base = ffmpegSource(file);
  const cache = new Map<string, Frame>();
  const src = {
    ...base,
    async grab(frame: number, maxSide: number) {
      const key = `${maxSide}:${frame}`;
      let f = cache.get(key);
      if (!f) {
        src.grabs++;
        const k = Math.min(1, maxSide / Math.max(base.width, base.height));
        const w = Math.round(base.width * k), h = Math.round(base.height * k);
        const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(Math.max(0, (frame - 0.25) / base.fps)), '-i', file,
          '-vf', `scale=${w}:${h}:flags=bilinear`, '-frames:v', String(chunk), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 30 });
        for (const k2 of cache.keys()) if (Number(k2.split(':')[1]) < frame - chunk) cache.delete(k2);
        const n = w * h * 4;
        for (let i = 0; (i + 1) * n <= buf.length; i++) cache.set(`${maxSide}:${frame + i}`, { width: w, height: h, data: new Uint8Array(buf.subarray(i * n, (i + 1) * n)) });
        f = cache.get(key);
        if (!f) throw new Error(`ffmpeg gav ingen bild ${frame}`);
      }
      return f;
    },
  };
  return src;
}
