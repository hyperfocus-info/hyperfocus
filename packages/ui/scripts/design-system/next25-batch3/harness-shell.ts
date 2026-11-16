import { connectHeadlessBrowser } from '@hyperfocus/desktop-runtime/automation';
import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
import { installRosterFixture } from '../next25-rosters/fixture';

const output = '.local/design-system/evidence/next25-batch3-shell';
await mkdir(output, { recursive: true });
const owner = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: object[] = [], errors: string[] = [];
let completed = false;
try {
  const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve('scripts/process-policy/windows-inspection.ts'), String(owner.pid)] });
  if (inspection.exitCode || JSON.parse(inspection.stdout.toString()).visibleWindows.length) throw new Error('Visible owned windows');
  await Bun.write(`${output}/windows.json`, inspection.stdout);
  const page = await owner.browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await installRosterFixture(page);
  for (const [size, width, height, scale] of [['desktop', 1440, 1000, ''], ['tablet', 820, 1000, ''], ['mobile', 390, 740, ''], ['scaled', 390, 1000, '200%']] as const) {
    await copyFile(`.local/design-system/evidence/next25-batch2-root/after/command-bar-${size}.png`, `${output}/before-${size}.png`);
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:8787');
    const context = page.getByRole('button', { name: 'View current project and thread', exact: true });
    await context.waitFor();
    await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale);
    await page.screenshot({ path: `${output}/after-${size}.png` });
    await context.click();
    const dialog = page.getByRole('dialog', { name: 'Current conversation', exact: true });
    await dialog.getByText('Workspace 001 customer release', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/context-${size}.png` });
    const overflow = await dialog.evaluate(node => node.scrollWidth > node.clientWidth + 1);
    if (overflow) throw new Error(`${size}: context dialog overflow`);
    await page.keyboard.press('Escape');
    if (!await context.evaluate(node => node === document.activeElement)) throw new Error(`${size}: context focus not restored`);
    const actions = page.getByRole('button', { name: 'More thread actions', exact: true });
    await actions.click();
    await page.getByRole('menuitem', { name: 'Terminal history', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: `${output}/history-${size}.png` });
    await page.keyboard.press('Escape');
    const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    if (geometry.scroll > geometry.width + 1) throw new Error(`${size}: page overflow`);
    results.push({ size, geometry });
  }
  if (errors.length) throw new Error(errors.join('; '));
  completed = true;
} catch (error) { errors.push(String(error)); throw error; }
finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ completed, results, errors, baseline: 'Preserved previous-batch full-host captures using the same intercepted roster fixture and viewport matrix.', scope: 'Managed Harness shell with intercepted workspace/commands; no live thread or terminal mutation.' }, null, 2));
  try { await owner.browser.close(); } finally { await owner.close(); }
}
