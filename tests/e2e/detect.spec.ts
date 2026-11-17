// Fas 2: automatisk träff i webbläsaren, mätt mot facit i samples/.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ballAt, parseFacit } from '../../src/annotate/facit';
import { CLIPS, SAMPLES, expectFrame } from './helpers';

async function detect(page: Page, clip: string, query = '') {
  await page.goto('/' + query);
  await page.setInputFiles('#file', join(SAMPLES, clip));
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
  await expect(page.locator('#btnAuto')).toBeEnabled();
  await page.click('#btnAuto');
  const val = page.locator('#impactVal');
  await expect(val).toHaveAttribute('data-method', /.+/, { timeout: 120_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', '1');
  return {
    method: await val.getAttribute('data-method'),
    frame: Number(await val.getAttribute('data-frame')),
    x: Number(await val.getAttribute('data-ball-x')),
    y: Number(await val.getAttribute('data-ball-y')),
    ms: Number(await val.getAttribute('data-ms')),
  };
}

for (const clip of CLIPS) {
  const facit = parseFacit(JSON.parse(readFileSync(join(SAMPLES, clip.name.replace(/\.\w+$/, '.json')), 'utf8')));
  const rest = ballAt(facit, facit.impactFrame!)!;
  const errors = (r: { frame: number; x: number; y: number }) => ({
    frames: r.frame - facit.impactFrame!,
    px: Math.hypot(r.x - rest.x * facit.width, r.y - rest.y * facit.height),
  });

  test(`${clip.name}: träffen och bollen hittas med ljud och bild`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const r = await detect(page, clip.name);
    const e = errors(r);
    console.log(`${clip.name} ljud+bild: träffbild ${r.frame} (facit ${facit.impactFrame}, fel ${e.frames}), bollfel ${e.px.toFixed(1)} px, ${r.ms} ms`);
    expect(r.method).toBe('ljud+bild');
    // Bildanalysen körs i en Web Worker.
    await expect(page.locator('#impactVal')).toHaveAttribute('data-worker', 'ja');
    // Kraven i fas 2.
    expect(Math.abs(e.frames)).toBeLessThanOrEqual(2);
    expect(e.px).toBeLessThanOrEqual(10);

    // Appen står kvar på träffbilden, startpunkten är satt och nästa steg är landningen.
    await expectFrame(page, r.frame);
    await expect(page.locator('#impactVal')).toContainText(`(bild ${r.frame}) · hittad med ljud och bild`);
    await expect(page.locator('#step2')).toHaveClass(/done/);
    await expect(page.locator('#hint')).toHaveText('Markera landningen (steg 3)');
    await expect(page.locator('#btnLand')).toBeEnabled();
    // Resultatet går att ångra.
    await page.click('#btnUndo');
    await expect(page.locator('#impactVal')).toHaveText('Inte satt');
    await page.click('#btnRedo');
    await expect(page.locator('#impactVal')).toContainText('hittad med ljud och bild');
    expect(pageErrors).toEqual([]);
  });

  test(`${clip.name}: utan ljud hittas träffen i bilden`, async ({ page }) => {
    const r = await detect(page, clip.name, '?ljud=av');
    const e = errors(r);
    console.log(`${clip.name} bara bild: träffbild ${r.frame} (facit ${facit.impactFrame}, fel ${e.frames}), bollfel ${e.px.toFixed(1)} px, ${r.ms} ms`);
    expect(r.method).toBe('bild');
    expect(Math.abs(e.frames)).toBeLessThanOrEqual(2);
    expect(e.px).toBeLessThanOrEqual(10);
    await expect(page.locator('#impactVal')).toContainText('hittad i bilden');
  });
}

test('efter automatisk träff går det att markera landning och exportera', async ({ page }) => {
  const r = await detect(page, 'IMG_0180.mov');
  await page.locator('#scrub').focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await expectFrame(page, r.frame + 60);
  await page.click('#btnLand');
  const box = (await page.locator('#overlay').boundingBox())!;
  await page.mouse.click(box.x + 0.62 * box.width, box.y + 0.37 * box.height);
  await expect(page.locator('#btnExport')).toBeEnabled();
  // Flygtiden räknas från den skattade träfftiden, som ligger inom träffbildens intervall.
  const flight = Number(await page.locator('#flight').inputValue());
  expect(flight).toBeGreaterThanOrEqual(1.9);
  expect(flight).toBeLessThanOrEqual(2.0);
  await page.click('#btnExport');
  await expect(page.locator('#result')).toBeVisible({ timeout: 120_000 });
});

test('den manuella vägen finns kvar bredvid den automatiska', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#file', join(SAMPLES, 'IMG_0180.mov'));
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
  await page.locator('#scrub').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.click('#btnImpact');
  await expect(page.locator('#hint')).toHaveText('Peka på bollen vid träffen');
  await expect(page.locator('#impactVal')).toHaveText('Träff vid 0:00.33 (bild 10) · peka på bollen');
});
