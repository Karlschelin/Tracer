// Ritning av tracer-linjen. Ren funktion av (ctx, tid, bana, stil).
import { pos, type Point, type Trajectory } from '../trajectory/model';

export interface TraceStyle {
  color: string;
  /** Tjocklek i tusendelar av bildhöjden. */
  width: number;
  glow: boolean;
}

/** Ett slag: bana plus tider. Fält som inte är satta än är null. */
export interface Shot {
  impact: number | null;
  flight: number;
  start: Point | null;
  end: Point | null;
  apex: Point | null;
  apexFrac: number;
  /** Perspektiv från den automatiska banan (0 = ingen). Se warp() i trajectory/model.ts. */
  perspective?: number;
}

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function mix(hex: string, hex2: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(hex2);
  return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')';
}

export function trajectoryOf(shot: Shot): Trajectory | null {
  if (!shot.start || !shot.end) return null;
  return { start: shot.start, end: shot.end, apex: shot.apex, apexFrac: shot.apexFrac, perspective: shot.perspective ?? 0 };
}

/** Lägger banan från u=0 till u=u1 som en path i ctx. */
export function pathTo(ctx: Ctx, T: Trajectory, W: number, H: number, u1: number): void {
  const n = Math.max(2, Math.ceil(240 * u1));
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = pos(T, (u1 * i) / n);
    if (i) ctx.lineTo(p.x * W, p.y * H); else ctx.moveTo(p.x * W, p.y * H);
  }
}

/** Ritar linjen så långt den hunnit vid tiden t (sekunder i videon). */
export function drawTrace(ctx: Ctx, W: number, H: number, t: number, shot: Shot, style: TraceStyle): void {
  const T = trajectoryOf(shot);
  if (shot.impact == null || !T) return;
  const tau = Math.min(1, Math.max(0, (t - shot.impact) / shot.flight));
  if (tau <= 0) return;
  const w = (style.width * H) / 1000;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  pathTo(ctx, T, W, H, tau);
  if (style.glow) { ctx.shadowColor = style.color; ctx.shadowBlur = w * 2.5; }
  ctx.strokeStyle = style.color; ctx.lineWidth = w; ctx.stroke();
  if (style.glow) ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = mix(style.color, '#ffffff', 0.6); ctx.lineWidth = w * 0.36; ctx.stroke();
  if (tau < 1) {
    const p = pos(T, tau);
    ctx.fillStyle = '#ffffff';
    if (style.glow) { ctx.shadowColor = style.color; ctx.shadowBlur = w * 3; }
    ctx.beginPath(); ctx.arc(p.x * W, p.y * H, w * 0.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
