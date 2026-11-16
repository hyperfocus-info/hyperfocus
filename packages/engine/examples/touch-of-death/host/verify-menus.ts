import { resolve } from 'node:path';
import type { Page } from 'playwright-core';

/** Reuses the acceptance runner's owned browser and real pointer input. */
export async function verifyGameMenus({ page, url, output }: { page: Page; url: string; output: string }) {
  const routes = [
    { name: 'title', path: [], expected: 'Play' },
    { name: 'play', path: ['Play'], expected: 'Fight the AI' },
    { name: 'local', path: ['Play', 'Fight the AI'], expected: 'Start match' },
    { name: 'online', path: ['Play', 'Online'], expected: 'Play with friends' },
    { name: 'watch', path: ['Play', 'Watch fights'], expected: 'Watch a replay' },
    { name: 'practice', path: ['Practice'], expected: 'Free practice' },
    { name: 'settings', path: ['Settings'], expected: 'Game settings' },
  ];
  const captures = [];
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForFunction(() => Reflect.get(globalThis, '__hyperfocusPlayable')?.ready);
      for (const name of route.path) await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('button', { name: route.expected, exact: true }).waitFor();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`${route.name} overflows at ${width}px.`);
      const image = `menu-${width}-${route.name}.png`;
      await page.screenshot({ path: resolve(output, image) });
      captures.push({ width, route: route.name, image });
      if (route.path.length) {
        await page.locator('.tod-back:visible').click();
        await page.getByRole('button', { name: route.path.at(-1)!, exact: true }).waitFor();
      }
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => Reflect.get(globalThis, '__hyperfocusPlayable')?.ready);
  return captures;
}
