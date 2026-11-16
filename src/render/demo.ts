// Exempelscenen som visas innan en video har laddats.
import type { Ctx, Shot } from './tracer';

export const DEMO_SHOT: Shot = {
  impact: 0.6, flight: 3.2,
  start: { x: 0.47, y: 0.69 }, apex: { x: 0.5, y: 0.2 }, end: { x: 0.56, y: 0.53 },
  apexFrac: 0.52,
};

export function drawDemoBg(ctx: Ctx, W: number, H: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.53);
  sky.addColorStop(0, '#b9c6d3'); sky.addColorStop(1, '#dfe5ea');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6f7c74';
  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * W, bh = H * (0.012 + ((i * 37) % 11) / 400);
    ctx.fillRect(x, H * 0.535 - bh, W / 26 + 1, bh);
  }
  const g = ctx.createLinearGradient(0, H * 0.53, 0, H);
  g.addColorStop(0, '#6d8a4f'); g.addColorStop(1, '#4b6a35');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.53, W, H * 0.47);
  ctx.fillStyle = '#3fa04a'; ctx.fillRect(W * 0.08, H * 0.68, W * 0.62, H * 0.07);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(W * 0.47, H * 0.69, Math.max(2, W * 0.008), 0, Math.PI * 2); ctx.fill();
}
