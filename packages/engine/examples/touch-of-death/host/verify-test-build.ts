import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { connectHeadlessBrowser, browserExecutable } from '@hyperfocus/desktop-runtime/automation';
import { inspectWindowsProcessTrees } from '@hyperfocus/desktop-runtime/automation/windows-inspection';
import { verifyGameMenus } from './verify-menus.ts';
const inspectBrowserWindows = (pid: number) => process.platform === 'win32' ? inspectWindowsProcessTrees({ rootPids: [pid] }) : { visibleWindows: [] };

const url = process.argv[2], output = resolve(process.argv[3] ?? '.local/touch-of-death/test-readiness/smoke');
const menusOnly = process.argv.includes('--menus-only');
const setsArgument = process.argv.indexOf('--sets');
const sets = setsArgument < 0 ? 3 : Number(process.argv[setsArgument + 1]);
const productionDefaults = process.argv.includes('--production-defaults');
if (![1, 2, 3].includes(sets)) throw Error('--sets must be 1, 2, or 3.');
if (!url || !/^https?:\/\//.test(url)) throw Error('Pass the exact game URL and optional evidence directory.');
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: browserExecutable(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const errors: string[] = [], failures: unknown[] = [], matches: unknown[] = [], checks: string[] = [];
type FrameTiming = { p50?: number } | null;
const report: Record<string, unknown> & { defaults: unknown[]; gameplayPerformance?: FrameTiming; performance?: FrameTiming } = { url, startedAt: new Date().toISOString(), method: menusOnly ? 'Fresh browser; native title navigation at desktop and phone widths. No gameplay acceptance claimed.' : `Fresh browser; native menus and keyboard events; ${sets} real first-to-three sets. No restored or manufactured combat states.`, matches, errors, failures, checks, defaults: [] };
try {
const page = await owned.browser.newPage({ viewport: { width: 1366, height: 768 } });
page.setDefaultTimeout(20_000);
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  const address = new URL(response.url());
  // This optional development-only receipt import deliberately returns 404 in
  // an extracted host. It is never requested on the public HTTPS game.
  const optionalReceipt = response.status() === 404 && ['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname) && address.pathname === '/tod-ai-ingestion-receipts';
  if (response.status() >= 400 && !optionalReceipt) failures.push({ url: response.url(), status: response.status() });
});
page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failures.push({ url: request.url(), error: request.failure() }); });
function check(value: unknown, label: string) { if (!value) throw Error(label);checks.push(label); }
async function verifyPerformanceDefaults(stage: string) {
  const settings = await page.evaluate(() => {
    const snapshot = Reflect.get(globalThis, '__hyperfocusPlayable').performance.snapshot();
    return { preferences: snapshot.preferences, experiments: snapshot.experiments };
  });
  report.defaults.push({ stage, ...settings });
  if (!productionDefaults) return;
  check(settings.preferences.vsync && !settings.preferences.telemetry && settings.preferences.showFps, `${stage}: rAF pacing, telemetry off, FPS visible`);
  const { requested, effective, allowed, tainted } = settings.experiments;
  check(requested.hudLayout === 'post-first' && effective.hudLayout === (allowed ? 'post-first' : 'original'), `${stage}: post-first requested with safe suspended fallback`);
  check(requested.resolution === 1 && effective.resolution === 1 && !tainted, `${stage}: full resolution and unmodified simulation`);
  for (const [name, value] of Object.entries(effective)) if (typeof value === 'boolean') check(value, `${stage}: ${name} enabled`);
}
async function state(target: Page) {
  return target.evaluate(() => {
    const api = Reflect.get(globalThis, '__hyperfocusPlayable'), snapshot = api.snapshot(), combat = snapshot.combat;
    return { tick: snapshot.tick, frame: combat.state.frame, match: combat.match,
      fighters: combat.state.fighters.map((fighter: { id: string; health: number; stamina: number; position: unknown; moveId: string }) => ({ id: fighter.id, health: fighter.health, stamina: fighter.stamina, position: fighter.position, moveId: fighter.moveId })),
      diagnostics: api.diagnostics, stats: api.rendererStats, audio: (() => { const audio = api.audioResources?.();return audio && { effects: { loading: audio.effects.loading, trackedCommands: audio.effects.trackedCommands, totalStarted: audio.effects.totalStarted, capacity: audio.effects.capacity }, music: audio.music }; })(), music: api.music?.(),
      heap: Reflect.get(performance, 'memory')?.usedJSHeapSize };
  });
}
await page.addInitScript(() => {
  const intervals: number[] = [], longTasks: number[] = [];
  const observations = { intervals, longTasks, sources: 0, activeSources: 0, maximumSources: 0, audioPeak: 0, audibleSamples: 0 };
  Reflect.set(globalThis, '__todReadiness', observations);
  let last = 0;
  const frame = (time: number) => { if (last && observations.intervals.length < 100_000) observations.intervals.push(time - last);last = time;requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  new PerformanceObserver(list => { for (const entry of list.getEntries()) if (observations.longTasks.length < 1000) observations.longTasks.push(entry.duration); }).observe({ entryTypes: ['longtask'] });
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    observations.sources++;observations.activeSources++;observations.maximumSources = Math.max(observations.maximumSources, observations.activeSources);
    this.addEventListener('ended', () => observations.activeSources--, { once: true });
    return start.apply(this, args);
  };
  const connect = AudioNode.prototype.connect, analysers = new Map<BaseAudioContext, AnalyserNode>();
  // Parameters<> sees only the final native overload; retain both destination forms.
  AudioNode.prototype.connect = function (this: AudioNode, ...args: [destination: AudioNode, output?: number, input?: number] | [destination: AudioParam, output?: number]) {
    const target = args[0];
    if (target instanceof AudioDestinationNode && !analysers.has(this.context)) {
      const analyser = this.context.createAnalyser();analyser.fftSize = 256;
      Reflect.apply(connect, this, [analyser]);analysers.set(this.context, analyser);
    }
    return Reflect.apply(connect, this, args);
  };
  const samples = new Float32Array(256);
  setInterval(() => { for (const analyser of analysers.values()) {
    analyser.getFloatTimeDomainData(samples);const peak = Math.max(...samples.map(Math.abs));
    observations.audioPeak = Math.max(observations.audioPeak, peak);if (peak > .0001) observations.audibleSamples++;
  } }, 100);
});
try {
  report.windows = inspectBrowserWindows(owned.pid);
  const document = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  check(document.ok, 'Game document responds successfully');
  report.documentSha256 = new Bun.CryptoHasher('sha256').update(await document.arrayBuffer()).digest('hex');
  const started = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => Reflect.get(globalThis, '__hyperfocusPlayable')?.ready, undefined, { timeout: 120_000 });
  report.bootMilliseconds = Date.now() - started;
  await verifyPerformanceDefaults('Fresh boot');
  await page.screenshot({ path: resolve(output, 'fresh.png') });
  check(await page.getByRole('button', { name: 'Continue', exact: true }).isVisible(), 'Fresh state offers sound choice');
  await page.getByRole('button', { name: 'Skip guide', exact: true }).click();
  if (menusOnly) report.menus = await verifyGameMenus({ page, url, output });
  if (!menusOnly) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Fight the AI', exact: true }).click();
  for (let set = 0; set < sets; set++) {
    await page.getByRole('button', { name: set ? 'Rematch · same AI' : 'Start match', exact: true }).click();
    await page.getByRole('button', { name: 'Skip intro · Start', exact: true }).click();
    await page.waitForFunction(() => Reflect.get(globalThis, '__hyperfocusPlayable').snapshot().combat.match.phase === 'fighting');
    if (set === 0) await verifyPerformanceDefaults('Local fight');
    const initial = await state(page), began = Date.now(), phases: unknown[] = [];
    check(initial.match.playerWins === 0 && initial.match.opponentWins === 0, `Set ${set + 1} resets score`);
    check(initial.fighters.every((fighter: { health: number }) => fighter.health > 0), `Set ${set + 1} restores both fighters`);
    await page.keyboard.down('KeyL');await page.waitForTimeout(300);await page.keyboard.up('KeyL');
    await page.keyboard.press('KeyJ', { delay: 70 });await page.keyboard.press('KeyK', { delay: 70 });
    await page.keyboard.press('Escape', { delay: 70 });await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    const paused = await state(page);await page.waitForTimeout(300);
    check((await state(page)).frame === paused.frame, `Set ${set + 1} pauses combat`);
    await page.keyboard.press('Escape', { delay: 70 });
    let previous = '', missingSince = 0;
    while (Date.now() - began < 150_000) {
      const current = await state(page), phase = `${current.match.phase}:${current.match.playerWins}:${current.match.opponentWins}`;
      if (phase !== previous) {
        previous = phase;phases.push({ milliseconds: Date.now() - began, ...current });
        await page.screenshot({ path: resolve(output, `set-${set + 1}-${phases.length}.png`) });
      }
      if (current.match.phase === 'match-result') break;
      const visibleBars = await page.locator('.hf-fighter-bar:visible').count();
      if (current.match.phase === 'fighting' && visibleBars < 2) {
        missingSince ||= Date.now();
        if (Date.now() - missingSince > 500) {
          await Bun.write(resolve(output, `camera-failure-${set + 1}.json`), JSON.stringify(await page.evaluate(() => Reflect.get(globalThis, '__hyperfocusPlayable').snapshot())));
          await page.screenshot({ path: resolve(output, `camera-failure-${set + 1}.png`) });
          throw Error(`Set ${set + 1}: fighter projection absent for over 500ms (${visibleBars} visible plates)`);
        }
      } else missingSince = 0;
      await page.waitForTimeout(180);
    }
    const final = await state(page);
    matches.push({ initial, final, phases, elapsedMilliseconds: Date.now() - began });
    await Bun.write(resolve(output, 'progress.json'), JSON.stringify(matches, null, 2));
    check(final.match.phase === 'match-result', `Set ${set + 1} completes a real first-to-three match`);
    check(Math.max(final.match.playerWins, final.match.opponentWins) === 3, `Set ${set + 1} has a valid terminal score`);
    check(await page.getByRole('button', { name: 'Rematch · same AI', exact: true }).isVisible(), `Set ${set + 1} offers rematch`);
    console.log(`Completed set ${set + 1}: ${final.match.playerWins}-${final.match.opponentWins} (${Date.now() - began}ms)`);
  }
  await page.getByRole('button', { name: 'Main menu', exact: true }).click();
  check(await page.getByRole('button', { name: 'Play', exact: true }).isVisible(), 'Result returns to title');
  }
  report.gameplayPerformance = await performanceEvidence();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Reflect.get(globalThis, '__hyperfocusPlayable')?.ready);
  check(await page.getByRole('button', { name: 'Play', exact: true }).isVisible(), 'Reload retains first-use completion and opens title');
  await verifyPerformanceDefaults('Reload');
  check(errors.length === 0, 'No uncaught browser errors');check(failures.length === 0, 'No failed assets or service requests');
  report.complete = true;
} catch (error) {
  report.failure = String(error);process.exitCode = 1;
  await Bun.write(resolve(output, 'failure-state.json'), JSON.stringify(await page.evaluate(() => Reflect.get(globalThis, '__hyperfocusPlayable')?.snapshot() ?? null).catch(() => null)));
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => undefined);
} finally {
  report.performance = await performanceEvidence();
  const timing = report.gameplayPerformance ?? report.performance;
  if ((timing?.p50 ?? 0) > 33.333333333333336) report.performanceWarning = 'Median frame interval exceeds 33.3ms on this machine. Functional completion is not a readiness verdict.';
  await owned.browser.close();await owned.close();report.cleanup = inspectBrowserWindows(owned.pid);
  await Bun.write(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ complete: report.complete, failure: report.failure, matches: matches.length, checks, errors, failures, performance: report.gameplayPerformance ?? report.performance, performanceWarning: report.performanceWarning }, null, 2));
}

async function performanceEvidence() {
  return page.evaluate(() => {
    const proof = Reflect.get(globalThis, '__todReadiness');if (!proof) return null;
    const sorted = proof.intervals.toSorted((a: number, b: number) => a - b);
    return { samples: sorted.length, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], over50: sorted.filter((value: number) => value > 50).length, longTasks: proof.longTasks.length, maximumLongTask: Math.max(0, ...proof.longTasks), sources: proof.sources, activeSources: proof.activeSources, maximumSources: proof.maximumSources, audioPeak: proof.audioPeak, audibleSamples: proof.audibleSamples };
  }).catch(() => null);
}

} finally { await owned.close(); }
