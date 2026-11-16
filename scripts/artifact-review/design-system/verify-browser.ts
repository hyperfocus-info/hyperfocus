import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { connectHeadlessBrowser } from '@hyperfocus/desktop-runtime/automation';
import { createArtifactManifest } from '../create';
import { createArtifactReviewServer } from '../server';
import { inspectWindowsProcessTrees } from '../../process-policy/windows-inspection';

const directory = await mkdtemp(join(tmpdir(), 'hyperfocus-image-review-'));
const manifest = await createArtifactManifest({ id: 'isolated-image-review', title: 'Design comparison verification', items: (['before', 'after'] as const).map(phase => ({ id: phase, kind: 'image' as const, title: `${phase} response settings`, media: resolve(`.local/design-system/evidence/next25-batch6-website/${phase}/form-desktop-entry.png`), comparison: { id: 'form', phase } })) });
await Bun.write(join(directory, 'manifest.json'), JSON.stringify(manifest));
const host = await createArtifactReviewServer({ manifestPath: join(directory, 'manifest.json'), port: 0 });
const executable = [...new Bun.Glob('ms-playwright/chromium-*/chrome-win64/chrome.exe').scanSync({ cwd: process.env.LOCALAPPDATA!, absolute: true })].sort().at(-1);
assert.ok(executable, 'Installed Chromium required');
const browser = await connectHeadlessBrowser({ executable, connect: endpoint => chromium.connectOverCDP(endpoint) });
const errors: string[] = [], cases: object[] = [];
const output = resolve(process.env.ARTIFACT_REVIEW_VERIFY_OUTPUT ?? '.local/design-system/review-verification');
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 820, 390]) {
    const context = await browser.browser.newContext({ viewport: { width, height: 950 }, hasTouch: width === 390 });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const saved = () => page.waitForFunction(() => document.getElementById('save-status')?.textContent === 'Saved');
    try {
      await page.goto(host.server.url.toString());
      await page.locator('#after-image').waitFor();
      await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
      const prior = (await (await fetch(new URL('/api/feedback', host.server.url))).json()).items.after.review?.annotations.length ?? 0;
      await page.getByRole('button', { name: 'Draw image region', exact: true }).click();
      await page.locator('#after-image').scrollIntoViewIfNeeded();
      const bounds = (await page.locator('#after-image').boundingBox())!;
      if (width === 390) {
        const input = await context.newCDPSession(page);
        await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width * .15, y: bounds.y + bounds.height * .2 }] });
        await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + bounds.width * .6, y: bounds.y + bounds.height * .55 }] });
        await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await input.detach();
      } else {
        await page.mouse.move(bounds.x + bounds.width * .15, bounds.y + bounds.height * .2);
        await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .6, bounds.y + bounds.height * .55, { steps: 8 }); await page.mouse.up();
      }
      await page.locator('#annotation-note').fill(`Region ${width}`); await page.locator('#add-note').click(); await saved();
      let feedback = (await (await fetch(new URL('/api/feedback', host.server.url))).json()).items.after.review;
      assert.equal(feedback.annotations.length, prior + 1);
      const rect = feedback.annotations.at(-1).rect; assert.ok(rect && Math.abs(rect.width - .45) < .015);
      await page.reload(); await page.locator('.image-region-box').first().waitFor();
      await page.locator('.reviewing').getByRole('button', { name: 'Actual size', exact: true }).click();
      await page.waitForFunction(() => Math.abs(document.querySelector<HTMLImageElement>('#after-image')!.getBoundingClientRect().width - document.querySelector<HTMLImageElement>('#after-image')!.naturalWidth) < 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('.reviewing').getByRole('button', { name: 'Fit image', exact: true }).click();
      await page.locator('#annotations li').last().getByRole('button', { name: 'Edit', exact: true }).click();
      await page.locator('#annotation-note').fill(`Edited ${width}`); await page.locator('#add-note').click(); await saved();
      feedback = (await (await fetch(new URL('/api/feedback', host.server.url))).json()).items.after.review;
      assert.deepEqual(feedback.annotations.at(-1).rect, rect);
      await page.getByRole('button', { name: 'Review before', exact: true }).click();
      assert.ok((await page.locator('#identity').textContent())?.includes('BEFORE'));
      await page.getByText('Set region with keyboard', { exact: true }).click();
      await page.getByLabel('Left (%)', { exact: true }).fill('90');
      await page.getByRole('button', { name: 'Set region', exact: true }).click();
      assert.ok(await page.locator('.region-error').textContent());
      await page.getByLabel('Left (%)', { exact: true }).fill('10');
      await page.getByRole('button', { name: 'Set region', exact: true }).focus(); await page.keyboard.press('Enter');
      await page.locator('#annotation-note').fill(`Before note ${width}`); await page.locator('#add-note').click(); await saved();
      const before = (await (await fetch(new URL('/api/feedback', host.server.url))).json()).items.before.review;
      assert.equal(before.annotations.at(-1).rect.x, .1);
      await page.locator('#annotation-note').fill('Unsubmitted note');
      page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Review after', exact: true }).click();
      assert.equal(await page.locator('#annotation-note').inputValue(), 'Unsubmitted note');
      await page.locator('#clear-anchor').click(); await page.getByRole('button', { name: 'Review after', exact: true }).click();
      await page.locator('#annotations li').last().getByRole('button', { name: 'Delete', exact: true }).click(); await saved();
      assert.equal((await (await fetch(new URL('/api/feedback', host.server.url))).json()).items.after.review.annotations.length, prior);
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: join(output, `review-${width}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => localStorage.length), 0);
      cases.push({ width, pointerRegion: true, keyboardRegion: true, editReloadDelete: true, independentSides: true, draftGuard: true, enlargedText: true });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  const windows = inspectWindowsProcessTrees({ rootPids: [browser.pid] }).visibleWindows; assert.deepEqual(windows, []);
  await Bun.write(join(output, 'report.json'), JSON.stringify({ cases, errors, windows }, null, 2));
  console.log(JSON.stringify({ cases: cases.length, errors }));
} finally {
  try { await browser.browser.close(); } finally { await browser.close(); host.close(); await rm(directory, { recursive: true, force: true }); }
}
