import { connectHeadlessBrowser } from '@hyperfocus/desktop-runtime/automation';
import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installRosterFixture } from './fixture';
import { rosterRecordButton, selectRosterRecord, visibleRecordHeight } from './interactions';
const phase = process.env.DESIGN_CAPTURE_PHASE ?? 'after';
const output = `.local/design-system/evidence/next25-rosters/${phase}`;
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: unknown[] = [], errors: string[] = [];
let completed = false;
try {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve('scripts/process-policy/windows-inspection.ts'), String(owned.pid)] });
    const windows = JSON.parse(inspection.stdout.toString());
    if (inspection.exitCode || windows.visibleWindows.length)
        throw new Error('Visible owned windows');
    await Bun.write(`${output}/windows.json`, JSON.stringify({ visibleWindows: windows.visibleWindows }));
    const page = await owned.browser.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    await installRosterFixture(page);
    await page.goto(process.env.HARNESS_URL ?? 'http://127.0.0.1:8787');
    await page.locator('[data-test-virtual-list-item]').first().waitFor({ state: 'attached' });
    for (const [size, width, height, scale] of [['desktop', 1440, 1000, ''], ['tablet', 820, 1000, ''], ['mobile', 390, 740, ''], ['scaled', 390, 1000, '200%']] as const) {
        if (process.env.DESIGN_CAPTURE_SIZE && process.env.DESIGN_CAPTURE_SIZE !== size)
            continue;
        await page.setViewportSize({ width, height });
        await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        for (const [surface, kind, search] of [['Jobs', 'jobs', 'Search jobs'], ['Runs', 'runs', 'Search runs'], ['Assistants', 'assistants', 'Search assistants'], ['Projects', 'projects', 'Search projects']] as const) {
            const navigation = page.locator('[data-panel-group-mode="navigation"]');
            if (await navigation.isVisible())
                await navigation.click();
            await page.getByRole('tablist', { name: 'Workspace panels', exact: true }).getByRole('tab', { name: surface, exact: true }).click();
            if (await navigation.isVisible())
                await navigation.click();
            const pane = page.locator(`[data-left-pane-kind="${kind}"]`).filter({ visible: true }).first();
            await pane.getByRole('searchbox', { name: search, exact: true }).waitFor();
            await page.bringToFront();
            await page.mouse.move(0, 0);
            await page.screenshot({ path: `${output}/${surface.toLowerCase()}-${size}.png` });
            const geometry = await pane.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.clientHeight, scrollHeight: element.scrollHeight }));
            const filter = pane.getByRole('button', { name: /Filter and sort|Sort and group/ }).first();
            if (await filter.count()) {
                await filter.click();
                const popover = page.locator('[data-test-popover-content]').filter({ visible: true });
                const group = popover.locator('button[aria-expanded]').first();
                if (await group.count()) {
                    await group.focus();
                    await page.keyboard.press('ArrowRight');
                    if (phase === 'after' && await group.getAttribute('aria-expanded') !== 'true')
                        throw new Error(`${surface}/${size}: filter keyboard expansion failed`);
                }
                if (phase === 'after') {
                    await page.evaluate(() => new Promise(requestAnimationFrame));
                    const bounds = await popover.boundingBox();
                    if (!bounds || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > width + 1 || bounds.y + bounds.height > height + 1)
                        throw new Error(`${surface}/${size}: expanded filters escape viewport`);
                }
                await page.screenshot({ path: `${output}/${surface.toLowerCase()}-${size}-filters.png` });
                await page.keyboard.press('Escape');
                if (phase === 'after' && !await filter.evaluate(element => element === document.activeElement))
                    throw new Error(`${surface}/${size}: filter focus not restored`);
            }
            if (phase === 'after') {
                const body = pane.locator('[data-test-left-pane-body]');
                const bodyHeight = await body.evaluate(element => element.clientHeight);
                if (bodyHeight < 180)
                    throw new Error(`${surface}/${size}: list viewport collapsed (${bodyHeight})`);
                try {
                    await selectRosterRecord({ page, pane, surface, index: 0 });
                }
                catch (error) {
                    await page.screenshot({ path: `${output}/failure-first.png` });
                    throw error;
                }
                if (await navigation.isVisible())
                    await navigation.click();
                try {
                    await selectRosterRecord({ page, pane, surface, index: 79 });
                }
                catch (error) {
                    await page.screenshot({ path: `${output}/failure-last.png` });
                    throw error;
                }
                if (await navigation.isVisible())
                    await navigation.click();
                await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
                await rosterRecordButton(pane, surface, 79).waitFor({ state: 'visible', timeout: 2000 });
                // Native virtualizer scroll-end debounce is 150ms; verify restoration survives it.
                await page.waitForTimeout(220);
                const restored = await pane.locator('[data-test-virtual-list]').first().evaluate(element => ({ height: element.clientHeight, scroll: element.scrollHeight, top: element.scrollTop, rows: element.querySelectorAll('[data-test-virtual-list-item]').length, text: element.textContent ?? '' }));
                if (!restored.text.includes('080 customer release'))
                    throw new Error(`${surface}/${size}: returning to navigation lost visible selected row (${JSON.stringify(restored)})`);
                const visibility = await visibleRecordHeight(rosterRecordButton(pane, surface, 79));
                if (visibility.visible < Math.min(32, visibility.height) - 1)
                    throw new Error(`${surface}/${size}: selected control clipped after return (${JSON.stringify(visibility)})`);
                await page.screenshot({ path: `${output}/${surface.toLowerCase()}-${size}-last-row.png` });
                await pane.getByRole('searchbox', { name: search, exact: true }).fill('');
                await pane.evaluate(element => { element.scrollTop = 0; });
            }
            results.push({ surface, size, geometry });
            if (phase === 'after' && geometry.scrollWidth > geometry.width + 1)
                throw new Error(`${surface}/${size}: horizontal overflow`);
        }
    }
    if (errors.length)
        throw new Error(errors.join('; '));
    completed = true;
}
catch (error) {
    errors.push(String(error));
    throw error;
}
finally {
    await Bun.write(`${output}/report.json`, JSON.stringify({ completed, results, errors }, null, 2));
    try {
        await owned.browser.close();
    }
    finally {
        await owned.close();
    }
}
