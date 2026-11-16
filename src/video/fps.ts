// Skattning av bildfrekvens från tidsstämplarna i requestVideoFrameCallback. Rena funktioner.

/** Vanliga bildfrekvenser som en mätning fästs mot om den ligger inom 1 %. */
export const COMMON_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 120, 240];

export function snapFps(raw: number): number {
  let best = raw, err = 0.01;
  for (const c of COMMON_FPS) {
    const e = Math.abs(raw - c) / c;
    if (e < err) { err = e; best = c; }
  }
  return best === raw ? Math.round(raw * 1000) / 1000 : best;
}

/**
 * Bildfrekvens ur en följd av mediaTime-värden (sekunder) för visade bilder.
 * Tappade bilder ger dubbla intervall, så bara intervallen nära det kortaste används.
 * Returnerar null om underlaget är för litet.
 */
export function fpsFromMediaTimes(times: number[]): number | null {
  const t = [...new Set(times)].sort((a, b) => a - b);
  const d: number[] = [];
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > 1e-4) d.push(t[i] - t[i - 1]);
  if (d.length < 3) return null;
  const dmin = Math.min(...d);
  const near = d.filter((v) => v <= dmin * 1.3).sort((a, b) => a - b);
  if (near.length < 2) return null;
  const mid = near.length >> 1;
  const med = near.length % 2 ? near[mid] : (near[mid - 1] + near[mid]) / 2;
  return snapFps(1 / med);
}

/** Bildindex (0-baserat) för en tid i videon. */
export function frameAtTime(t: number, fps: number): number {
  return Math.max(0, Math.floor(t * fps + 1e-4));
}

/** Tiden mitt i en bildruta. Dit söker vi, så att avrundning aldrig hamnar i grannrutan. */
export function frameCenterTime(frame: number, fps: number): number {
  return (frame + 0.5) / fps;
}

export function frameCountOf(duration: number, fps: number): number {
  return Math.max(1, Math.round(duration * fps));
}
