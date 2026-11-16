import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { parseFacit } from '../../src/annotate/facit';
import {
  CLIPS, FACIT_OUT, SAMPLES, clickStage, expectFrame, ffmpegFrames, hasFfmpeg, likeness, loadClip, shownFrame,
} from './helpers';

test.describe('ladda klipp', () => {
  for (const clip of CLIPS) {
    test(`${clip.name}: storlek, bildfrekvens och antal bilder läses av automatiskt`, async ({ page }) => {
      await loadClip(page, clip.name);
      const stage = page.locator('#stage');
      await expect(stage).toHaveAttribute('data-fps', String(clip.fps));
      await expect(stage).toHaveAttribute('data-frames', String(clip.frames));
      await expect(page.locator('#fps option:checked')).toHaveText(`Auto (${clip.fps} fps)`);
      await expect(page.locator('#fileInfo')).toContainText(`${clip.width}×${clip.height}`);
      await expectFrame(page, 0);
      const size = await page.evaluate(() => {
        const v = document.querySelector('#video') as HTMLVideoElement;
        return [v.videoWidth, v.videoHeight, v.duration];
      });
      expect(size[0]).toBe(clip.width);
      expect(size[1]).toBe(clip.height);
      expect(size[2]).toBeCloseTo(clip.duration, 2);
    });
  }
});

test.describe('bildexakt stegning', () => {
  test('ett tryck är en bildruta, framåt och bakåt', async ({ page }) => {
    await loadClip(page, 'IMG_0180.mov');
    const time = () => page.evaluate(() => (document.querySelector('#video') as HTMLVideoElement).currentTime);
    for (let n = 1; n <= 12; n++) {
      await page.click('#btnFwd');
      await expectFrame(page, n);
      expect(await time()).toBeCloseTo((n + 0.5) / 30, 4);
    }
    await page.keyboard.press('Shift+ArrowRight');
    await expectFrame(page, 22);
    for (let n = 21; n >= 18; n--) {
      await page.keyboard.press('ArrowLeft');
      await expectFrame(page, n);
    }
    // Snabba tryck i följd läggs ihop i stället för att tappas bort.
    for (let i = 0; i < 5; i++) await page.click('#btnFwd', { delay: 0 });
    await expectFrame(page, 23);
    await expect(page.locator('#frameNo')).toHaveText('bild 23/120');
    // Stegning stannar vid klippets ändar.
    await page.locator('#scrub').fill('1');
    await expectFrame(page, 120);
    await page.click('#btnFwd');
    await expectFrame(page, 120);
  });

  test('bildruta n i appen är samma bild som bildruta n i filen', async ({ page }) => {
    test.skip(!hasFfmpeg(), 'kräver ffmpeg');
    // Ett utsnitt i full upplösning mitt i bilden, där spelaren och bollbanan finns.
    const crop = { x: 568, y: 1300, w: 1024, h: 768 };
    // Normalt jämförs bilderna kring träffen. E2E_FULL=1 jämför alla bilder i båda klippen (tar ett par minuter).
    const full = !!process.env.E2E_FULL;
    for (const { name, from, to } of [
      { name: 'IMG_0180.mov', from: full ? 1 : 16, to: full ? 119 : 30 },
      { name: 'IMG_0178.mov', from: full ? 1 : 47, to: full ? 203 : 60 },
    ]) {
      await loadClip(page, name);
      const ref = ffmpegFrames(name, from - 1, to + 1, crop);
      expect(ref).toHaveLength(to - from + 3);
      await page.locator('#scrub').focus();
      for (let n = 1; n <= from; n++) await page.keyboard.press('ArrowRight');
      let worst = Infinity;
      const wrong: string[] = [];
      for (let n = from; n <= to; n++) {
        await expectFrame(page, n);
        const shown = await shownFrame(page, crop);
        // Hur väl den visade bilden liknar bild n-1, n och n+1 i filen, sedan det som är gemensamt för
        // de tre (bakgrunden och skillnader i färgomvandling) räknats bort.
        const score = likeness(shown, [ref[n - from], ref[n - from + 1], ref[n - from + 2]]);
        const margin = score[1] - Math.max(score[0], score[2]);
        if (margin <= 0) wrong.push(`bild ${n}: likhet ${score.map((v) => v.toFixed(3)).join(' / ')}`);
        worst = Math.min(worst, margin);
        await page.keyboard.press('ArrowRight');
      }
      expect(wrong, `${name}: bildrutor som inte stämmer med filen`).toEqual([]);
      console.log(`${name}: bild ${from}–${to} är samma bild i appen som i filen (minsta marginal ${worst.toFixed(3)}).`);
    }
  });
});

test('hela flödet: träff, landning och export ger en video med rätt längd och storlek', async ({ page }) => {
  await loadClip(page, 'IMG_0180.mov');
  await page.locator('#scrub').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expectFrame(page, 20);
  await page.click('#btnImpact');
  await expect(page.locator('#hint')).toHaveText('Peka på bollen vid träffen');
  await clickStage(page, 0.4118, 0.7372);
  await expect(page.locator('#impactVal')).toHaveText('Träff vid 0:00.67 (bild 20)');
  await expect(page.locator('#btnExport')).toBeDisabled();

  await page.locator('#scrub').focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await expectFrame(page, 80);
  await page.click('#btnLand');
  await clickStage(page, 0.62, 0.37);
  await expect(page.locator('#flight')).toHaveValue('2.0');
  await expect(page.locator('#hint')).toBeHidden();

  // Ångra och gör om landningspunkten.
  await page.click('#btnUndo');
  await expect(page.locator('#btnExport')).toBeDisabled();
  await page.click('#btnRedo');
  await expect(page.locator('#btnExport')).toBeEnabled();

  await expect(page.locator('#result')).toBeHidden();
  await page.click('#btnExport');
  await expect(page.locator('#hint')).toHaveText('Exporterar…');
  const result = page.locator('#result');
  await expect(result).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#dl')).toHaveAttribute('download', /^golf-tracer\.(mp4|webm)$/);

  const out = await page.evaluate(async () => {
    const v = document.querySelector('#outVideo') as HTMLVideoElement;
    if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
    // Inspelade filer saknar ibland längd i huvudet. Då hittar en sökning långt fram det riktiga slutet.
    if (!isFinite(v.duration)) {
      await new Promise<void>((r) => { v.addEventListener('durationchange', () => { if (isFinite(v.duration)) r(); }); v.currentTime = 1e7; });
    }
    const size = (await (await fetch(v.src)).blob()).size;
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, size };
  });
  // 2160×3840 skalas till längsta sidan 1920. Linjen är klar vid 0,67 + 2,0 + 0,8 s, före klippets slut (4,03 s).
  expect(out.width).toBe(1080);
  expect(out.height).toBe(1920);
  expect(out.duration).toBeGreaterThan(3.8);
  expect(out.duration).toBeLessThan(4.8);
  expect(out.size).toBeGreaterThan(300_000);
  console.log('Exporterad video: ' + JSON.stringify(out));
});

test.describe('annoteringsläge', () => {
  test.beforeEach(() => rmSync(FACIT_OUT, { recursive: true, force: true }));

  test('utkastet läses in, en punkt rättas och facit sparas', async ({ page }) => {
    const original = readFileSync(join(SAMPLES, 'IMG_0178.json'), 'utf8');
    const draft = parseFacit(JSON.parse(original));
    await loadClip(page, 'IMG_0178.mov');
    await page.click('#btnAnnot');
    await expect(page.locator('body')).toHaveClass(/annot/);
    await expect(page.locator('#step2')).toBeHidden();
    await expect(page.locator('#annCount')).toContainText(`${draft.ball.length} punkter`);
    await expect(page.locator('#annImpactVal')).toHaveText(`Träffbild: ${draft.impactFrame}`);

    await page.click('#annGoImpact');
    await expectFrame(page, draft.impactFrame!);
    await page.click('#btnFwd');
    const f = draft.impactFrame! + 1;
    await expectFrame(page, f);
    await expect(page.locator('#annFrame')).toContainText('automatisk punkt');

    // Rätta punkten: klicket sätter den för hand och appen går vidare till nästa bild.
    await clickStage(page, 0.48, 0.61);
    await expectFrame(page, f + 1);
    await page.click('#btnBack');
    await expectFrame(page, f);
    await expect(page.locator('#annFrame')).toContainText('punkt satt för hand');
    await expect(page.locator('#annCount')).toContainText('1 satta för hand');
    await expect(page.locator('#annCount')).toContainText('ej sparat');

    // Ångra tar tillbaka den automatiska punkten, gör om sätter den igen.
    await page.click('#btnUndo');
    await expect(page.locator('#annFrame')).toContainText('automatisk punkt');
    await page.click('#btnRedo');
    await expect(page.locator('#annFrame')).toContainText('punkt satt för hand');

    // Ta bort en punkt och sätt landning och status.
    await page.click('#btnFwd');
    await expectFrame(page, f + 1);
    await page.click('#annRemove');
    await expect(page.locator('#annFrame')).toContainText('ingen punkt');
    await page.locator('#scrub').focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expectFrame(page, f + 11);
    await page.click('#annLanding');
    await expect(page.locator('#hint')).toHaveText('Peka där bollen landar');
    await clickStage(page, 0.3, 0.5);
    await expect(page.locator('#annLandingVal')).toHaveText(`Landning: bild ${f + 11}`);
    await expectFrame(page, f + 11); // landningen flyttar inte bilden
    await page.click('#annPrevGap');
    await expectFrame(page, f + 1);
    await page.selectOption('#annStatus', 'granskad');

    await page.click('#annSave');
    await expect(page.locator('#annMsg')).toHaveText('Sparat i samples/IMG_0178.json.');
    await expect(page.locator('#annCount')).not.toContainText('ej sparat');

    const saved = parseFacit(JSON.parse(readFileSync(join(FACIT_OUT, 'IMG_0178.json'), 'utf8')));
    expect(saved.status).toBe('granskad');
    expect(saved.impactFrame).toBe(draft.impactFrame);
    expect(saved.landing).toMatchObject({ frame: f + 11 });
    expect(saved.landing!.x).toBeCloseTo(0.3, 2);
    expect(saved.landing!.y).toBeCloseTo(0.5, 2);
    const fixed = saved.ball.find((b) => b.frame === f)!;
    expect(fixed.source).toBe('manuell');
    expect(fixed.x).toBeCloseTo(0.48, 2);
    expect(fixed.y).toBeCloseTo(0.61, 2);
    expect(saved.ball.find((b) => b.frame === f + 1)).toBeUndefined();
    // Alla andra punkter är orörda.
    const untouched = (b: { frame: number }) => b.frame !== f && b.frame !== f + 1;
    expect(saved.ball.filter(untouched)).toEqual(draft.ball.filter(untouched));
    // Testet har inte rört det riktiga facit i samples/.
    expect(readFileSync(join(SAMPLES, 'IMG_0178.json'), 'utf8')).toBe(original);
  });

  test('facit från början: träffbild och punkter bild för bild', async ({ page }) => {
    await loadClip(page, 'IMG_0180.mov');
    await page.click('#btnAnnot');
    // Börja om från ett tomt facit genom att läsa in ett.
    await page.setInputFiles('#annFile', {
      name: 'tomt.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        version: 1, clip: 'IMG_0180.mov', width: 2160, height: 3840, fps: 30, frameCount: 121,
        status: 'utkast', impactFrame: null, ball: [], landing: null, notes: '',
      })),
    });
    await expect(page.locator('#annMsg')).toHaveText('Läste in tomt.json.');
    await expect(page.locator('#annCount')).toHaveText('Inga punkter');

    await page.locator('#scrub').focus();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expectFrame(page, 20);
    await page.click('#annImpact');
    await expect(page.locator('#annImpactVal')).toHaveText('Träffbild: 20');
    const pts = [[0.4118, 0.7372], [0.4167, 0.7008], [0.4301, 0.6065], [0.4394, 0.5482]];
    for (let i = 0; i < pts.length; i++) {
      await expectFrame(page, 20 + i);
      await clickStage(page, pts[i][0], pts[i][1]);
    }
    await expectFrame(page, 24);
    await expect(page.locator('#annCount')).toContainText('4 punkter · 3 efter träffen (bild 21–23)');
    await page.click('#annSave');
    await expect(page.locator('#annMsg')).toContainText('Sparat');
    const saved = parseFacit(JSON.parse(readFileSync(join(FACIT_OUT, 'IMG_0180.json'), 'utf8')));
    expect(saved.ball.map((b) => b.frame)).toEqual([20, 21, 22, 23]);
    saved.ball.forEach((b, i) => {
      expect(b.source).toBe('manuell');
      // Klickprecision: inom en halv skärmpixel av det begärda läget.
      expect(Math.abs(b.x - pts[i][0])).toBeLessThan(0.002);
      expect(Math.abs(b.y - pts[i][1])).toBeLessThan(0.002);
    });

    // En trasig fil avvisas med förklaring och ändrar ingenting.
    await page.setInputFiles('#annFile', { name: 'fel.json', mimeType: 'application/json', buffer: Buffer.from('{"version": 9}') });
    await expect(page.locator('#annMsg')).toContainText('Ogiltigt facit');
    await expect(page.locator('#annCount')).toContainText('4 punkter');
    expect(existsSync(join(SAMPLES, 'tomt.json'))).toBe(false);
  });
});

test('utan video visas exemplet och kontrollerna är avstängda', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('#hint')).toHaveText('Exempel · ladda upp din video för att börja');
  for (const id of ['btnPlay', 'btnBack', 'btnFwd', 'btnImpact', 'btnLand', 'btnExport']) {
    await expect(page.locator('#' + id)).toBeDisabled();
  }
  await expect(page.locator('#samplePick option')).toHaveCount(CLIPS.length + 1);
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', '0');
  expect(errors.filter((e) => !/fonts\.g/.test(e))).toEqual([]);
});
