import { connectHeadlessBrowser, browserExecutable } from '@hyperfocus/desktop-runtime/automation';
import { inspectWindowsProcessTrees } from '@hyperfocus/desktop-runtime/automation/windows-inspection';
import { chromium } from 'playwright-core';
import { optional, readList, readObject, requireNumber, requireOneOf } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';

const nonemptyText = (value: unknown) => requireText(value, { nonBlank: true });
const texts = (value: unknown) => readList(value, entry => requireText(entry));
function readCatalog(value: unknown) {
  const catalog = readObject(value, {
    pageSize: value => requireNumber(value, { minimum: 1, integer: true }),
    items: value => readList(value, item => readObject(item, {
      src: nonemptyText, kind: value => requireOneOf(value, ['image', 'video', 'audio']), path: nonemptyText, caption: value => requireText(value),
      states: texts, weapons: texts, scenes: texts,
      cohort: optional(value => requireText(value)), surface: optional(value => requireText(value)), outcome: optional(value => requireText(value)), sourcePath: optional(value => requireText(value)),
      deviceClass: optional(value => requireOneOf(value, ['desktop', 'mobile'])), scenarioId: optional(value => requireText(value)),
    })),
  });
  if (!catalog.items.length) throw Error('Album catalog has no media captures.');
  return catalog;
}

/** Verify an existing album without modifying media, captions or review feedback. */
export async function verifyAlbum(options: { url: string; images?: number; videos?: number; audios?: number; output: string; decodeImages?: 'all' | 'sample' }) {
  const owned = await connectHeadlessBrowser({ executable: browserExecutable(), connect: endpoint => chromium.connectOverCDP(endpoint) });
  try {
    const page = await owned.browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors: string[] = [], checked: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(options.url, { waitUntil: 'domcontentloaded' });
    for (const selector of ['#albumData', '#mediaFilter', '#captureFilter', '#weaponFilter', '#searchEvidence', '#clearFilters', '#resultCount', '#noResults', '#pagePrevious', '#pageNext', '#pageStatus']) {
      if (await page.locator(selector).count() !== 1) throw Error(`Missing or ambiguous required album control: ${selector}`);
    }
    const catalog = readCatalog(JSON.parse(await page.locator('#albumData').textContent() ?? ''));
    const images = catalog.items.filter(item => item.kind === 'image').length, videos = catalog.items.filter(item => item.kind === 'video').length, audios = catalog.items.filter(item => item.kind === 'audio').length, total = catalog.items.length;
    const uniqueMedia = new Set(catalog.items.map(item => item.src)).size;
    const uniqueImages = new Set(catalog.items.filter(item => item.kind === 'image').map(item => item.src)).size;
    if (options.images !== undefined && images !== options.images) throw Error(`Expected ${options.images} images, found ${images}.`);
    if (options.videos !== undefined && videos !== options.videos) throw Error(`Expected ${options.videos} videos, found ${videos}.`);
    if (options.audios !== undefined && audios !== options.audios) throw Error(`Expected ${options.audios} audio captures, found ${audios}.`);
    checked.push('catalog inventory');
    const matchCount = async () => {
      const value = await page.locator('#resultCount').getAttribute('data-count');
      if (value === null || !/^\d+$/.test(value)) throw Error('Album result count has no valid data-count.');
      return Number(value);
    };
    if (await matchCount() !== total) throw Error('Initial result count differs from the catalog.');
    if (!await page.locator('#pagePrevious').isDisabled()) throw Error('First page allows previous-page navigation.');
    if (Number(await page.locator('#pageStatus').getAttribute('data-pages')) !== Math.ceil(total / catalog.pageSize)) throw Error('Page count differs from the catalog and card bound.');
    const decoded = new Set<string>(), decodeMode = options.decodeImages ?? 'all';
    let pagesVisited = 0;
    while (true) {
      const cards = page.locator('.tile');
      if (!await cards.count() || await cards.count() > catalog.pageSize) throw Error('Album page is empty or exceeds its declared card bound.');
      const thumbnails = page.locator('.tile[data-kind="image"] img');
      for (let index = 0; index < await thumbnails.count(); index++) {
        const thumbnail = thumbnails.nth(index);
        await thumbnail.scrollIntoViewIfNeeded();
        const src = await thumbnail.evaluate(async image => {
          if (!(image instanceof HTMLImageElement)) throw Error('Missing album image.');
          await image.decode(); return image.currentSrc;
        }, undefined, { timeout: 15_000 });
        decoded.add(src);
      }
      pagesVisited++;
      if (await page.locator('#pageNext').isDisabled() || decodeMode === 'sample' && pagesVisited >= 2) break;
      const previous = await page.locator('#pageStatus').getAttribute('data-page');
      await page.locator('#pageNext').click();
      await page.waitForFunction(value => document.querySelector('#pageStatus')?.getAttribute('data-page') !== value, previous);
    }
    if (decodeMode === 'all' && decoded.size !== uniqueImages) throw Error(`Decoded ${decoded.size} distinct image sources; catalog declares ${uniqueImages}.`);
    if (decodeMode === 'sample' && total > catalog.pageSize && pagesVisited < 2) throw Error('Sample verification could not reach the second catalog page.');
    while (!await page.locator('#pagePrevious').isDisabled()) await page.locator('#pagePrevious').click();
    checked.push('bounded page cards', pagesVisited > 1 ? 'pagination traversal' : 'single-page navigation bounds');
    if (images) checked.push(decodeMode === 'all' ? 'all image decoding' : 'sampled image decoding');
    const first = page.locator('.tile').first();
    await first.click(); await page.locator('#viewer').waitFor({ state: 'visible' });
    const position = () => page.locator('#position').textContent();
    if ((await position())?.trim() !== `1 / ${total}`) throw Error('Viewer did not open the first catalog item.');
    await page.keyboard.press('ArrowLeft');
    if ((await position())?.trim() !== `${total} / ${total}`) throw Error('Previous did not wrap across the complete catalog.');
    await page.keyboard.press('ArrowRight');
    if ((await position())?.trim() !== `1 / ${total}`) throw Error('Next did not wrap across the complete catalog.');
    await page.keyboard.press('Escape');
    if (await page.locator('#viewer').isVisible()) throw Error('Escape did not close the viewer.');
    if (!await first.evaluate(element => element === document.activeElement)) throw Error('Closing the viewer did not return focus to its thumbnail.');
    checked.push('modal', 'keyboard catalog wrap', 'escape', 'focus return');
    const audioMetadata = [];
    for (const src of new Set(catalog.items.filter(item => item.kind === 'audio').map(item => item.src))) {
      const duration = await page.evaluate(src => new Promise<number>((resolve, reject) => {
        const media = new Audio();
        const timer = setTimeout(() => finish(Error('Audio metadata timeout: ' + src)), 15000);
        function finish(error?: Error) {
          clearTimeout(timer); media.pause(); media.removeAttribute('src'); media.load();
          if (error) reject(error);
        }
        media.onloadedmetadata = () => {
          const duration = media.duration;
          media.onloadedmetadata = null; media.onerror = null;
          if (!Number.isFinite(duration) || duration <= 0) { finish(Error('Invalid audio duration: ' + src)); return; }
          finish(); resolve(duration);
        };
        media.onerror = () => { media.onerror = null; finish(Error('Audio cannot decode: ' + src)); };
        media.src = src; media.preload = 'metadata';
      }), src);
      audioMetadata.push({ src, duration });
    }
    if (audios) checked.push('all distinct audio metadata decoding');
    for (const kind of ['video', 'audio'] as const) {
      if (!catalog.items.some(item => item.kind === kind)) continue;
      const selector = kind === 'video' ? '#fullVideo' : '#fullAudio';
      await page.locator('#mediaFilter').selectOption(kind);
      await page.locator(`.tile[data-kind="${kind}"]`).first().click();
      await page.locator(selector).evaluate(async element => {
        if (!(element instanceof HTMLMediaElement)) throw Error('Missing media player.');
        if (element.muted || !element.controls) throw Error('Album muted media or hid playback controls.');
        await element.play();
      });
      await page.waitForFunction(selector => {
        const media = document.querySelector<HTMLMediaElement>(selector);
        return media && (media.currentTime > Math.min(0.2, media.duration / 2) || media.ended);
      }, selector);
      const range = await page.locator(selector).evaluate(async element => {
        if (!(element instanceof HTMLMediaElement)) throw Error('Missing media player.');
        const response = await fetch(element.currentSrc, { headers: { Range: 'bytes=0-511' } });
        await response.body?.cancel(); return response.status;
      });
      if (range !== 206) throw Error(`Album server does not support ${kind} byte ranges.`);
      await page.keyboard.press('Escape');
      if (!await page.locator(selector).evaluate(element => element instanceof HTMLMediaElement && element.paused && !element.getAttribute('src'))) throw Error('Closed player retained playback.');
      await page.locator('#clearFilters').click();
      checked.push(`${kind} playback, range and close cleanup`);
    }
    const selectors = ['#mediaFilter', '#captureFilter', '#weaponFilter'];
    for (const field of ['surface', 'outcome', 'cohort'] as const) if (catalog.items.some(item => item[field])) selectors.push(`#${field}Filter`);
    if (catalog.items.some(item => item.deviceClass)) selectors.push('#deviceFilter');
    if (catalog.items.some(item => item.scenarioId)) selectors.push('#scenarioFilter');
    const filters = [];
    for (const selector of selectors) {
      const select = page.locator(selector);
      if (await select.count() !== 1) throw Error(`Missing or ambiguous required album filter: ${selector}`);
      const disclosure = select.locator('xpath=ancestor::details[1]');
      if (await disclosure.count() && !await select.isVisible()) await disclosure.locator('summary').click();
      const choices = await select.locator('option').evaluateAll(items => items.flatMap(item => item instanceof HTMLOptionElement && item.value ? [item.value] : []));
      if (!choices.includes('all')) throw Error(`Album filter ${selector} has no reset choice.`);
      if (selector === '#mediaFilter' && (images && !choices.includes('image') || videos && !choices.includes('video') || audios && !choices.includes('audio'))) throw Error('Album media filter omits an available media type.');
      for (const choice of choices) {
        const expected = catalog.items.filter(item => {
          if (choice === 'all') return true;
          if (selector === '#mediaFilter') return item.kind === choice;
          if (selector === '#captureFilter') return [...item.states, ...item.scenes].join(' ').toLowerCase().includes(choice);
          if (selector === '#weaponFilter') return item.weapons.some(value => value.toLowerCase() === choice);
          const field = selector === '#surfaceFilter' ? 'surface' : selector === '#outcomeFilter' ? 'outcome' : selector === '#deviceFilter' ? 'deviceClass' : selector === '#scenarioFilter' ? 'scenarioId' : 'cohort';
          return (field === 'outcome' ? item.outcome ?? 'unassessed' : item[field]) === choice;
        }).length;
        if (!expected) continue;
        await select.selectOption(choice);
        if (await matchCount() !== expected) throw Error(`Album filter ${selector}: ${choice} did not match its catalog subset of ${expected}.`);
        if (await page.locator('.tile').count() > Math.min(expected, catalog.pageSize)) throw Error('Filtered page exceeds its card bound.');
        if (!await page.locator('#pagePrevious').isDisabled() || Number(await page.locator('#pageStatus').getAttribute('data-pages')) !== Math.ceil(expected / catalog.pageSize)) throw Error('Filtering did not reset pagination to the expected first page.');
        filters.push({ selector, choice, expected });
      }
      await page.locator('#clearFilters').click();
      if (await select.inputValue() !== 'all') throw Error(`Clear filters did not reset ${selector}.`);
    }
    checked.push('required filter controls', 'applicable filter choices and reset');
    const search = page.locator('#searchEvidence'), exactPath = catalog.items[0].sourcePath || catalog.items[0].path;
    await search.fill(exactPath);
    if (await matchCount() !== 1) throw Error('Exact source/file-path search did not select its one capture.');
    await search.fill('__hyperfocus_album_no_matching_capture__');
    if (await matchCount() !== 0 || !await page.locator('#noResults').isVisible()) throw Error('Empty search did not show the recovery state.');
    await page.locator('#clearFilters').click();
    if (await search.inputValue() || await matchCount() !== total || await page.locator('#noResults').isVisible()) throw Error('Clear filters did not recover from empty search.');
    checked.push('exact capture search', 'empty search and clear recovery');
    await page.setViewportSize({ width: 390, height: 844 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw Error('Album overflows a narrow viewport.');
    checked.push('narrow layout');
    if (errors.length) throw Error(errors.join('\n'));
    const windows = process.platform === 'win32' ? inspectWindowsProcessTrees({ rootPids: [owned.pid] }).visibleWindows : [];
    if (windows.length) throw Error('Album verification created a visible browser window.');
    if (process.platform === 'win32') checked.push('hidden process');
    const report = { url: options.url, captures: total, uniqueMedia, images, videos, audios, audioMetadata, imageDecoding: { mode: decodeMode, decoded: decoded.size, uniqueImages, pagesVisited }, filters, errors, checked };
    await Bun.write(options.output, JSON.stringify(report, null, 2));
    return report;
  } finally { try { await owned.browser.close(); } finally { await owned.close(); } }
}
