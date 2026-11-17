import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

export const SAMPLES = join(import.meta.dirname, '../../samples');
export const FACIT_OUT = join(import.meta.dirname, '../../.tmp/e2e-facit');

export const CLIPS = [
  { name: 'IMG_0178.mov', width: 2160, height: 3840, fps: 30, frames: 205, duration: 6.833 },
  { name: 'IMG_0180.mov', width: 2160, height: 3840, fps: 30, frames: 121, duration: 4.033 },
  { name: 'IMG_3297.mov', width: 2160, height: 3840, fps: 30, frames: 191, duration: 6.367 },
  { name: 'IMG_8435.mov', width: 2160, height: 3840, fps: 30, frames: 235, duration: 7.833 },
] as const;

/** Väljer ett klipp i filväljaren och väntar tills appen har läst av det. */
export async function loadClip(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.setInputFiles('#file', join(SAMPLES, name));
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
}

export const frameNo = async (page: Page): Promise<number> => Number(await page.locator('#stage').getAttribute('data-frame'));

export async function expectFrame(page: Page, n: number): Promise<void> {
  await expect(page.locator('#stage')).toHaveAttribute('data-frame', String(n));
  // Vänta tills sökningen är klar så att bilden på skärmen är den rätta.
  await page.waitForFunction(() => !(document.querySelector('#video') as HTMLVideoElement).seeking);
}

/** Klickar på en normaliserad punkt (0..1) i videobilden. */
export async function clickStage(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('#overlay').boundingBox())!;
  await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
}

export const hasFfmpeg = (): boolean => spawnSync('ffmpeg', ['-version']).status === 0;

export interface Crop { x: number; y: number; w: number; h: number }

/** Ett utsnitt i full upplösning (gråskala) direkt ur filen med ffmpeg, för bildrutorna first..last. */
export function ffmpegFrames(name: string, first: number, last: number, c: Crop): Uint8Array[] {
  const buf = execFileSync('ffmpeg', [
    '-v', 'error', '-i', join(SAMPLES, name),
    '-vf', `select=between(n\\,${first}\\,${last}),crop=${c.w}:${c.h}:${c.x}:${c.y}`,
    '-fps_mode', 'passthrough', '-pix_fmt', 'gray', '-f', 'rawvideo', '-',
  ], { maxBuffer: 1 << 30 });
  const out: Uint8Array[] = [];
  const n = c.w * c.h;
  for (let i = 0; i + n <= buf.length; i += n) out.push(new Uint8Array(buf.subarray(i, i + n)));
  return out;
}

/** Samma utsnitt ur bilden som visas i videoelementet just nu, pixel för pixel utan skalning. */
export async function shownFrame(page: Page, c: Crop): Promise<Uint8Array> {
  const b64 = await page.evaluate((c) => {
    const v = document.querySelector('#video') as HTMLVideoElement;
    const cv = document.createElement('canvas'); cv.width = c.w; cv.height = c.h;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(v, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
    const d = ctx.getImageData(0, 0, c.w, c.h).data;
    let s = '';
    for (let i = 0; i < d.length; i += 4) s += String.fromCharCode(Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]));
    return btoa(s);
  }, c);
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Korrelation mellan en bild och var och en av kandidaterna, efter att kandidaternas medelbild dragits
 * bort från alla. Det som återstår är det som skiljer bildrutorna åt (rörelse och brus).
 */
export function likeness(img: ArrayLike<number>, cands: ArrayLike<number>[]): number[] {
  const n = img.length;
  const mean = new Float64Array(n);
  for (const c of cands) for (let i = 0; i < n; i++) mean[i] += c[i] / cands.length;
  let ia = 0;
  for (let i = 0; i < n; i++) ia += img[i] - mean[i];
  ia /= n; // konstant ljusskillnad mellan avkodarna
  return cands.map((c) => {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i++) {
      const a = img[i] - mean[i] - ia, b = c[i] - mean[i];
      ab += a * b; aa += a * a; bb += b * b;
    }
    return ab / Math.sqrt(aa * bb || 1);
  });
}
