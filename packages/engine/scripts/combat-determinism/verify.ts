import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectHeadlessBrowser } from '@hyperfocus/desktop-runtime/automation';
import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { chromium } from 'playwright-core';
import { createScenario, scenarios, type Scenario } from './entry.ts';

const executable = [process.env.CHROME_PATH,
  process.env.PROGRAMFILES && resolve(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && resolve(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((path): path is string => !!path && existsSync(path));
if (!executable) throw new Error('Set CHROME_PATH to Chrome or Edge for the combat determinism gate.');
const entrypoint = resolve(import.meta.dir, 'entry.ts');
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const browser = await connectHeadlessBrowser({ executable, connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: Array<{ scenario: string; frames: number; metrics: unknown }> = [];
function inspectWindows(closed: boolean) {
  if (process.platform !== 'win32') return;
  const command = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, '../../../../scripts/process-policy/windows-inspection.ts'), String(browser.pid)], stdout: 'pipe', stderr: 'pipe', timeout: 20_000 });
  if (command.error) throw command.error;
  assert.equal(command.exitCode, 0, command.stderr?.toString());
  const result = JSON.parse(command.stdout!.toString());
  assert.deepEqual(result.visibleWindows, [], 'Owned browser exposed a desktop window.');
  if (closed) assert.deepEqual(result.processes, [], 'Owned browser processes survived cleanup.');
  console.log({ closed, processCount: result.processes.length, visibleWindows: result.visibleWindows });
}
try {
  inspectWindows(false);
  const page = await browser.browser.newPage();
  const build = async (native = false) => {
    const output = await Bun.build({ entrypoints: [entrypoint], target: 'browser', format: 'iife', plugins: native ? [{ name: 'native-math-negative-control', setup(build) {
      build.onLoad({ filter: /[\\/]math[\\/]simulation\.ts$/ }, () => ({ loader: 'js', contents: 'export const {sin,cos,atan2,acos,sqrt,hypot}=Math;' }));
    } }] : [] });
    if (!output.success) throw new Error(String(output.logs));return output.outputs[0]!.text();
  };
  await page.addScriptTag({ content: await build() });
  const begin = (name: Scenario) => page.evaluate(async name => {
    Reflect.set(globalThis, '__combatDeterminismStep', (await Reflect.get(globalThis, '__combatDeterminismScenario')(name)).step);
  }, name);
  const stepBrowser = () => page.evaluate(() => JSON.parse(JSON.stringify(Reflect.get(globalThis, '__combatDeterminismStep')())));
  for (const name of scenarios) {
    const local = await createScenario(name);await begin(name);
    let frame = 0;
    while (true) {
      const expected = json(local.step()), actual = await stepBrowser();
      try { assert.deepEqual(actual, expected); }
      catch (cause) { throw new Error(`${name}: complete checkpoint diverged at frame ${frame}`, { cause }); }
      frame++;
      if (expected.done) { results.push({ scenario: name, frames: frame, metrics: expected.metrics });console.log(results.at(-1));break; }
    }
  }
  await page.goto('about:blank');await page.addScriptTag({ content: await build(true) });
  const local = await createScenario('launch');await begin('launch');
  let diverged = false;
  for (let frame = 0; frame < 180; frame++) {
    const expected = json(local.step()), actual = await stepBrowser();
    try { assert.deepEqual(actual, expected); } catch { diverged = true;results.push({ scenario: 'native-math-negative-control', frames: frame + 1, metrics: { diverged: true } });break; }
  }
  assert.ok(diverged, 'Negative control did not expose native math divergence.');
  console.log(JSON.stringify({ complete: true, results }, null, 2));
} finally { await browser.browser.close();await browser.close();inspectWindows(true); }
