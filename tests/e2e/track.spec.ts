// Fas 3: automatisk bollbana i webbläsaren, mätt mot facit i samples/.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { parseFacit } from '../../src/annotate/facit';
import { shotError, type FittedShot } from '../../src/trajectory/fit';
import { CLIPS, SAMPLES } from './helpers';

test.setTimeout(400_000);

for (const clip of CLIPS) {
  const facit = parseFacit(JSON.parse(readFileSync(join(SAMPLES, clip.name.replace(/\.\w+$/, '.json')), 'utf8')));

  test(`${clip.name}: bollbanan hittas automatiskt efter träffen`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto('/');
    await page.setInputFiles('#file', join(SAMPLES, clip.name));
    await expect(page.locator('#stage')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
    // Knappen kräver en träff först.
    await expect(page.locator('#btnTrack')).toBeDisabled();
    await page.click('#btnAuto');
    await expect(page.locator('#impactVal')).toHaveAttribute('data-method', /.+/, { timeout: 120_000 });
    await expect(page.locator('#btnTrack')).toBeEnabled();
    await page.click('#btnTrack');
    const val = page.locator('#trackVal');
    await expect(val).toHaveAttribute('data-confidence', /.+/, { timeout: 360_000 });
    await expect(page.locator('#stage')).toHaveAttribute('data-ready', '1');
    console.log(`${clip.name}: säkerhet ${await val.getAttribute('data-confidence')}, ${await val.textContent()}`);
    const shot = JSON.parse((await val.getAttribute('data-shot'))!) as FittedShot;
    const aspect = facit.width / facit.height;
    const flight = facit.ball.filter((b) => b.frame > facit.impactFrame!);
    const mean = flight.reduce((a, b) => a + shotError(shot, { t: (b.frame + 0.5) / facit.fps, x: b.x, y: b.y }, aspect), 0) / flight.length;
    console.log(`${clip.name} i webbläsaren: medelfel ${(100 * mean).toFixed(2)} %, säkerhet ${await val.getAttribute('data-confidence')}, ` +
      `${await val.getAttribute('data-points')} punkter, flygtid ${shot.flight.toFixed(2)} s, ${await val.getAttribute('data-ms')} ms`);
    expect(mean).toBeLessThan(0.03);
    expect(Number(await val.getAttribute('data-confidence'))).toBeGreaterThanOrEqual(0.5);
    await expect(val).toHaveAttribute('data-worker', 'ja');
    await expect(val).toContainText('Bollen följd i');
    // Start, topp, landning och flygtid är ifyllda: alla steg klara och exporten går att starta.
    for (const s of ['#step2', '#step3', '#step4']) await expect(page.locator(s)).toHaveClass(/done/);
    await expect(page.locator('#btnExport')).toBeEnabled();
    await expect(page.locator('#flight')).toHaveValue(shot.flight.toFixed(1));
    // Går att ångra som en enda ändring, och sedan justera för hand som förut.
    await page.click('#btnUndo');
    await expect(page.locator('#step3')).not.toHaveClass(/done/);
    await page.click('#btnRedo');
    await expect(page.locator('#step3')).toHaveClass(/done/);
    await expect(page.locator('#btnApex')).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });
}
