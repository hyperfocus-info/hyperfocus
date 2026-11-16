import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectHeadlessBrowser } from '@hyperfocus/desktop-runtime/automation';
import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { chromium } from 'playwright';
import { stylexSolidPlugin } from '../../../build-tools/stylex-solid-plugin';

const phase = process.env.DESIGN_CAPTURE_PHASE ?? 'after';
const optionsLongLabel = 'CustomerReleaseLocalizationCharacterLocomotionCycleWithoutWordSeparators';
assert.ok(['before', 'after'].includes(phase));
const bundle = resolve(`.local/design-system/selection-labels-${phase}`);
const output = resolve(`.local/design-system/evidence/next25-batch4-shared/${phase}`);
await mkdir(bundle, { recursive: true });
await mkdir(output, { recursive: true });
const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, 'fixture.tsx')], outdir: bundle, target: 'browser', format: 'iife', naming: 'main.[ext]', plugins: [stylexSolidPlugin({ generate: 'dom', hydratable: false })] });
assert.ok(build.success, build.logs.map(String).join('\n'));
await Bun.write(`${bundle}/index.html`, '<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="main.css"><body style="margin:0"><div id="root"></div><script src="main.js"></script></body></html>');
const owner = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: object[] = [], errors: string[] = [];
let completed = false;
try {
  if (process.platform === 'win32') {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve('scripts/process-policy/windows-inspection.ts'), String(owner.pid)] });
    await Bun.write(`${output}/windows.json`, inspection.stdout);
    assert.equal(inspection.exitCode, 0, inspection.stderr.toString());
  }
  for (const [size, width, scale] of [['desktop', 1440, ''], ['tablet', 820, ''], ['narrow', 390, ''], ['scaled', 390, '200%']] as const) {
    const context = await owner.browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width === 390 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(pathToFileURL(`${bundle}/index.html`).href);
      await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale);
      for (const adapter of ['Solid', 'Imperative']) {
        const trigger = page.getByRole('button', { name: `${adapter} clip`, exact: true });
        await trigger.click();
        const option = page.getByRole('option', { name: /anticipation and turn right/ });
        await option.waitFor();
        const bounds = await option.evaluate(node => {
          const label = [...node.querySelectorAll<HTMLElement>('*')].find(span => span.textContent?.endsWith('turn right') && span.children.length === 0)!;
          return { clipped: label.scrollWidth > label.clientWidth + 1, height: label.clientHeight, rowHeight: node.getBoundingClientRect().height, whitespace: getComputedStyle(label).whiteSpace };
        });
        await page.screenshot({ path: `${output}/${adapter.toLowerCase()}-${size}.png`, fullPage: true });
        if (phase === 'after') {
          assert.equal(bounds.clipped, false, `${adapter}/${size}: distinguishing suffix is clipped`);
          assert.ok(bounds.rowHeight >= bounds.height, `${adapter}/${size}: row height clips wrapped label`);
          await option.focus();
          await page.keyboard.press('Enter');
          assert.equal(await trigger.getAttribute('data-select-value'), 'end');
          assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
          await trigger.click();
          const long = page.getByRole('option', { name: optionsLongLabel });
          assert.equal(await long.evaluate(node => [...node.querySelectorAll<HTMLElement>('*')].some(child => child.children.length === 0 && child.scrollWidth > child.clientWidth + 1)), false, 'Unspaced option label fits');
          const popup = page.getByRole('listbox');
          const popupBounds = await popup.evaluate(node => { const bounds = node.getBoundingClientRect(); return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }; });
          assert.ok(popupBounds.left >= 0 && popupBounds.right <= width && popupBounds.top >= 0 && popupBounds.bottom <= 1000, `${adapter}/${size}: popup ${JSON.stringify(popupBounds)}`);
          await long.click();
          assert.equal(await trigger.getAttribute('data-select-value'), 'long');
        } else await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
        results.push({ adapter, size, bounds });
      }
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  completed = true;
} catch (error) { errors.push(String(error)); throw error; } finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ phase, completed, results, errors, scope: 'Shared real controls with adversarial clip labels; host task acceptance is recorded separately.' }, null, 2));
  try { await owner.browser.close(); } finally { await owner.close(); }
}
