// Hjälplinjer ovanpå videon i redigeringsläget: handtag för start/topp/landning och streckad bana.
import { autoApex, type Point } from '../trajectory/model';
import { pathTo, trajectoryOf, type Ctx, type Shot } from './tracer';

export type HandleKey = 'start' | 'apex' | 'end';
export const HANDLES: ReadonlyArray<readonly [HandleKey, string]> = [
  ['start', 'Start'], ['apex', 'Topp'], ['end', 'Landning'],
];

/** Punkten för ett handtag. Toppen faller tillbaka på den automatiska när den inte är satt. */
export function handlePoint(shot: Shot, key: HandleKey): Point | null {
  const p = shot[key];
  if (p) return p;
  if (key === 'apex' && shot.start && shot.end) return autoApex({ start: shot.start, end: shot.end });
  return null;
}

export function drawHandles(ctx: Ctx, W: number, H: number, dpr: number, shot: Shot): void {
  const r = 11 * dpr;
  ctx.save();
  ctx.font = `600 ${12 * dpr}px Barlow, system-ui, sans-serif`;
  for (const [key, label] of HANDLES) {
    const p = handlePoint(shot, key);
    if (!p) continue;
    const x = p.x * W, y = p.y * H;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = 'rgba(0,0,0,.35)';
    if (key === 'apex' && !shot.apex) ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x - 4 * dpr, y); ctx.lineTo(x + 4 * dpr, y);
    ctx.moveTo(x, y - 4 * dpr); ctx.lineTo(x, y + 4 * dpr);
    ctx.stroke();
    const tw = ctx.measureText(label).width + 10 * dpr;
    const lx = Math.min(W - tw - 2, Math.max(2, x + r + 4 * dpr));
    ctx.fillStyle = 'rgba(10,14,12,.8)';
    ctx.fillRect(lx, y - 9 * dpr, tw, 18 * dpr);
    ctx.fillStyle = '#ffffff'; ctx.fillText(label, lx + 5 * dpr, y + 4 * dpr);
  }
  ctx.restore();
}

export function drawGhost(ctx: Ctx, W: number, H: number, dpr: number, shot: Shot): void {
  const T = trajectoryOf(shot);
  if (!T) return;
  ctx.save();
  pathTo(ctx, T, W, H, 1);
  ctx.setLineDash([6 * dpr, 6 * dpr]);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  ctx.restore();
}
