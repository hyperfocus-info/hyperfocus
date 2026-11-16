import { connectHeadlessBrowser } from '@hyperfocus/desktop-runtime/automation';
import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { installRosterFixture } from '../next25-rosters/fixture';

const phase = process.env.DESIGN_CAPTURE_PHASE ?? 'after';
const output = `.local/design-system/evidence/next25-batch2-root/${phase}`;
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: object[] = [], errors: string[] = [];
let completed = false;
try {
  const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve('scripts/process-policy/windows-inspection.ts'), String(owned.pid)] });
  const windows = JSON.parse(inspection.stdout.toString());
  if (inspection.exitCode || windows.visibleWindows.length) throw new Error('Visible owned windows');
  await Bun.write(`${output}/windows.json`, JSON.stringify({ visibleWindows: windows.visibleWindows }));
  const page = await owned.browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const fixture = await installRosterFixture(page);
  for (const [size, width, height, scale] of [['desktop', 1440, 1000, ''], ['tablet', 820, 1000, ''], ['mobile', 390, 740, ''], ['scaled', 390, 1000, '200%']] as const) {
    await page.setViewportSize({ width, height });
    for (const surface of ['command-bar', 'global-search', 'terminal-sessions', 'terminal-search']) {
      await page.goto(surface === 'command-bar' ? 'http://127.0.0.1:8787' : `${pathToFileURL(resolve(`.local/design-system/batch2-root-${phase}/dist/index.html`)).href}?surface=${surface}`);
      if (surface === 'command-bar') await page.locator('[data-test-connection-banner][data-connection-state="connected"]').waitFor();
      await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${output}/${surface}-${size}.png` });
      const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, header: document.querySelector('[data-test-app-header]')?.getBoundingClientRect().height }));
      results.push({ surface, size, geometry });
      if (phase === 'after' && geometry.scroll > geometry.width + 1) throw new Error(`${surface}/${size}: horizontal overflow`);
      if (phase === 'after' && surface === 'command-bar') {
        const menu = page.getByRole('button', { name: 'Workspace actions', exact: true });
        await menu.focus(); await page.keyboard.press('Enter');
        await page.getByRole('menuitem', { name: 'Help and tutorials' }).waitFor();
        await page.keyboard.press('Escape');
        if (!await menu.evaluate(element => element === document.activeElement)) throw new Error('Workspace actions lost focus');
        await page.getByRole('button', { name: /^Resume new executions/ }).click();
        if (!fixture.commands.some(command => typeof command === 'object' && command !== null && 'type' in command && command.type === 'execution.resume-all')) throw new Error('Resume command not dispatched');
        if (size === 'scaled') {
          await page.setViewportSize({ width, height: 480 });
          await menu.click();
          await page.getByRole('menuitem', { name: 'Help and tutorials' }).click({ trial: true });
          const bounds = await page.getByRole('menu', { name: 'Workspace actions', exact: true }).boundingBox();
          if (!bounds || bounds.x < 0 || bounds.x + bounds.width > width || bounds.y + bounds.height > 480) throw new Error('Workspace menu escapes short viewport');
          await page.mouse.move(1, 1);
          await page.getByRole('menu', { name: 'Workspace actions', exact: true }).focus();
          await page.screenshot({ path: `${output}/command-bar-short-menu.png` });
          await page.keyboard.press('Escape');
          await page.setViewportSize({ width, height });
        }
      }
      if (phase === 'after' && surface === 'global-search') {
        await page.getByRole('textbox', { name: 'Find in files' }).fill('missing');
        await page.getByText('No matches. Try a different search.').waitFor();
        await page.getByRole('textbox', { name: 'Find in files' }).fill('customer');
        await page.getByRole('button', { name: /127:12/ }).click();
        if (!(await page.locator('output').innerText()).endsWith(':127')) throw new Error('Wrong search destination');
      }
      if (phase === 'after' && surface === 'terminal-search') {
        const input = page.getByRole('textbox', { name: 'Search terminal' });
        await input.fill('customer'); await input.press('Enter');
        if (await page.locator('output').innerText() !== 'next') throw new Error('Terminal search Enter failed');
        await page.getByRole('button', { name: 'Previous terminal match', exact: true }).click();
        if (await page.locator('output').innerText() !== 'previous') throw new Error('Terminal search previous failed');
      }
      if (phase === 'after' && surface === 'terminal-sessions') {
        await page.getByRole('button', { name: /^Rename Customer localization verification 1 —/ }).click();
        const input = page.getByRole('textbox', { name: 'Rename terminal' });
        await input.fill('Release verification'); await input.press('Enter');
        await page.getByRole('button', { name: 'Close Release verification', exact: true }).click();
        if (await page.locator('[data-terminal-session-row]').count() !== 29) throw new Error('Terminal close failed');
      }
    }
    if (phase === 'after') {
      await page.goto(`${pathToFileURL(resolve(`.local/design-system/batch2-root-${phase}/dist/index.html`)).href}?surface=connection-recovery`);
      await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale);
      await page.getByRole('button', { name: 'Retry connection', exact: true }).click({ trial: true });
      await page.mouse.move(1, 1);
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${output}/connection-recovery-${size}.png` });
    }
  }
  if (errors.length) throw new Error(errors.join('; '));
  completed = true;
} catch (error) {
  errors.push(String(error));
  throw error;
} finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ completed, results, errors, scope: 'Real UI with intercepted Harness data and isolated IDE/terminal callbacks; no shell or filesystem commands.' }, null, 2));
  try { await owned.browser.close(); } finally { await owned.close(); }
}
