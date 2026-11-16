/** Hämtar ett element som måste finnas i index.html. */
export function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error('Saknar element: ' + sel);
  return el;
}

export const fmtTime = (t: number): string => {
  if (!isFinite(t)) t = 0;
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + s.toFixed(2).padStart(5, '0');
};

/** Bildfrekvens utan onödiga decimaler: 30, 29.97, 59.94. */
export const fmtFps = (fps: number): string => String(Math.round(fps * 100) / 100).replace('.', ',');
