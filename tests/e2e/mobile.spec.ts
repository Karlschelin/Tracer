// Hela flödet i mobilformat (iPhone-storlek, pekskärm), via servern som mobilen ansluter till.
// Både den automatiska vägen och den manuella, med tryck i stället för musklick.
import { join } from 'node:path';
import { devices, expect, test, type Page } from '@playwright/test';
import { SAMPLES, expectFrame } from './helpers';

const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
test.use({ ...iphone });
test.setTimeout(400_000);

async function load(page: Page, clip: string) {
  await page.goto('/');
  await page.setInputFiles('#file', join(SAMPLES, clip));
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
}
async function tapStage(page: Page, x: number, y: number) {
  // Appen ska själv ha scrollat upp videon. Vänta tills den syns helt.
  await expect.poll(async () => {
    const b = (await page.locator('#overlay').boundingBox())!;
    return b.y >= -2 && b.y + b.height <= page.viewportSize()!.height + 2;
  }).toBe(true);
  const box = (await page.locator('#overlay').boundingBox())!;
  await page.touchscreen.tap(box.x + x * box.width, box.y + y * box.height);
}

test('mobil: automatisk träff och bollbana, sedan export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await load(page, 'IMG_0180.mov');
  await page.locator('#btnAuto').tap();
  await expect(page.locator('#impactVal')).toHaveAttribute('data-method', /.+/, { timeout: 120_000 });
  await page.locator('#btnTrack').tap();
  await expect(page.locator('#trackVal')).toContainText('Bollen följd i', { timeout: 360_000 });
  await expect(page.locator('#btnExport')).toBeEnabled();
  await page.locator('#btnExport').tap();
  await expect(page.locator('#result')).toBeVisible({ timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('mobil: manuell markering med tryck', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await load(page, 'IMG_0180.mov');
  // Stega fram till träffen (bild 20) med stegknappen.
  for (let i = 0; i < 20; i++) await page.locator('#btnFwd').tap();
  await expectFrame(page, 20);
  await page.locator('#btnImpact').tap();
  await expect(page.locator('#hint')).toHaveText('Peka på bollen vid träffen');
  await tapStage(page, 0.412, 0.737);
  await expect(page.locator('#step2')).toHaveClass(/done/);
  for (let i = 0; i < 60; i++) await page.locator('#btnFwd').tap();
  await page.locator('#btnLand').tap();
  await tapStage(page, 0.62, 0.37);
  await expect(page.locator('#step3')).toHaveClass(/done/);
  await page.locator('#btnApex').tap();
  await tapStage(page, 0.55, 0.3);
  await expect(page.locator('#step4')).toHaveClass(/done/);
  await expect(page.locator('#btnExport')).toBeEnabled();
  // Den automatiska bollbanan går att köra efter en manuell träff också.
  await page.locator('#btnTrack').tap();
  await expect(page.locator('#trackVal')).toHaveAttribute('data-confidence', /.+/, { timeout: 360_000 });
  expect(errors).toEqual([]);
});
