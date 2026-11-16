// Ritning för annoteringsläget: facit-punkter, markering av aktuell bild och förstoringslupp.
import type { Facit } from '../annotate/facit';
import type { Point } from '../trajectory/model';
import type { Ctx } from './tracer';

export interface AnnotationView {
  facit: Facit;
  frame: number;
  accent: string;
}

/** Ring med fyra streck och hål i mitten, så att bollen syns under markeringen. */
function reticle(ctx: Ctx, x: number, y: number, r: number, color: string, lw: number): void {
  ctx.save();
  ctx.lineWidth = lw + 2; ctx.strokeStyle = 'rgba(0,0,0,.55)';
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r * 1.7, y); ctx.lineTo(x - r * 0.55, y);
    ctx.moveTo(x + r * 0.55, y); ctx.lineTo(x + r * 1.7, y);
    ctx.moveTo(x, y - r * 1.7); ctx.lineTo(x, y - r * 0.55);
    ctx.moveTo(x, y + r * 0.55); ctx.lineTo(x, y + r * 1.7);
    ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = color;
  }
  ctx.restore();
}

export function drawAnnotations(ctx: Ctx, W: number, H: number, dpr: number, v: AnnotationView): void {
  const { facit, frame } = v;
  const imp = facit.impactFrame ?? -1;
  ctx.save();
  // Banan efter träffen som en tunn linje genom punkterna.
  const flight = facit.ball.filter((b) => b.frame > imp);
  if (flight.length > 1) {
    ctx.beginPath();
    flight.forEach((b, i) => (i ? ctx.lineTo(b.x * W, b.y * H) : ctx.moveTo(b.x * W, b.y * H)));
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1 * dpr; ctx.stroke();
  }
  // Vita prickar = automatiska punkter, fyllda med accentfärg = satta för hand.
  for (const b of flight) {
    if (b.frame === frame) continue;
    ctx.beginPath(); ctx.arc(b.x * W, b.y * H, 1.3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = b.source === 'manuell' ? v.accent : 'rgba(255,255,255,.9)';
    ctx.fill();
  }
  if (facit.landing) {
    const x = facit.landing.x * W, y = facit.landing.y * H, s = 7 * dpr;
    ctx.strokeStyle = v.accent; ctx.lineWidth = 2.5 * dpr;
    ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke();
  }
  const cur = facit.ball.find((b) => b.frame === frame);
  if (cur) reticle(ctx, cur.x * W, cur.y * H, 9 * dpr, cur.source === 'manuell' ? v.accent : '#ffffff', 1.5 * dpr);
  ctx.restore();
}

export interface LoupeOptions {
  /** Källbilden (videon). */
  source: CanvasImageSource;
  /** Källbildens storlek i pixlar. */
  sw: number;
  sh: number;
  /** Punkten som förstoras, normaliserad. */
  at: Point;
  /** Luppens mitt och radie på canvasen, i canvaspixlar. */
  cx: number;
  cy: number;
  radius: number;
  /** Hur många källpixlar luppen visar på bredden. */
  span: number;
  color: string;
  label?: string;
  dpr: number;
}

/** Rund förstoringslupp med hårkors. Visar videons egna pixlar kring punkten. */
export function drawLoupe(ctx: Ctx, o: LoupeOptions): void {
  const { cx, cy, radius: r } = o;
  const sx = o.at.x * o.sw - o.span / 2, sy = o.at.y * o.sh - o.span / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#000'; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  ctx.imageSmoothingEnabled = false;
  try { ctx.drawImage(o.source, sx, sy, o.span, o.span, cx - r, cy - r, 2 * r, 2 * r); } catch { /* ingen bild än */ }
  ctx.restore();
  ctx.lineWidth = 2 * o.dpr; ctx.strokeStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6 * o.dpr;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Hårkors med öppning i mitten.
  const g = r * 0.16;
  ctx.lineWidth = 1 * o.dpr; ctx.strokeStyle = o.color;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.8, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + r * 0.8, cy);
  ctx.moveTo(cx, cy - r * 0.8); ctx.lineTo(cx, cy - g); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + r * 0.8);
  ctx.stroke();
  if (o.label) {
    ctx.font = `600 ${11 * o.dpr}px Barlow, system-ui, sans-serif`;
    const tw = ctx.measureText(o.label).width + 10 * o.dpr;
    ctx.fillStyle = 'rgba(10,14,12,.8)'; ctx.fillRect(cx - tw / 2, cy + r - 20 * o.dpr, tw, 16 * o.dpr);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(o.label, cx, cy + r - 8 * o.dpr);
  }
  ctx.restore();
}
