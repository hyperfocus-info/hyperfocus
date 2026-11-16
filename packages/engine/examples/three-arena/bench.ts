import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { connectCdpSession, createCdpMessageRouter, type CdpSession } from "@hyperfocus/engine/tooling/cdp-client";
import {
  assertEngineMotionRequestProbe,
  parseEngineMotionRecoilProbe,
  parseEngineMotionSnapshotProbe,
  type EngineMotionRequestProbe,
} from "./request-probe-assertions.ts";
import type { BenchOptions, UnknownRecord } from "./bench/types.ts";

export type BenchRunResult = {
  url: string;
  warmupMs: number;
  moveMs: number;
  durationMs: number;
  stress: {
    enemies: number;
    pickups: number;
    effects: number;
    combat: boolean;
    allProps: boolean;
  };
  startedAt: string;
  start: UnknownRecord;
  end: UnknownRecord;
  delta: ReturnType<typeof snapshotDelta>;
  pageErrors: string[];
  consoleMessages: string[];
};

type ProbeResult = {
  url: string;
  probe: "request-fix";
  startedAt: string;
  damage: unknown;
  topProps: unknown;
  fire: unknown;
  magnet: {
    startActive: boolean;
    startMagnetized: number;
    afterActive: boolean;
    magnetized: number;
    particles: number;
    effects: number;
  };
  movement: {
    moving: UnknownRecord;
    damped: UnknownRecord;
    particlesBeforeMove: number;
    particlesAfterMove: number;
    playerAnimation: unknown;
    playerState: unknown;
    playerSource: unknown;
  };
  air: {
    falling: { player: unknown; state: unknown; phase: unknown; grounded: boolean; jumpY: number };
    landed: { played: UnknownRecord; phase: unknown; grounded: boolean; jumpY: number };
  };
  engineMotion: EngineMotionRequestProbe;
  tuning: unknown;
  pageErrors: string[];
  consoleMessages: string[];
};

const options = parseArgs(process.argv.slice(2));
if (options.selfTestCdp) {
  await runCdpSelfTest();
  console.log(JSON.stringify({ cdpSelfTest: "pass" }));
} else {
  const result = options.repeat > 1 ? await runRepeatedBench(options) : await runBench(options);
  if (options.out) {
    await mkdir(path.dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
}

async function runRepeatedBench(opts: BenchOptions) {
  const runs: BenchRunResult[] = [];
  for (let index = 0; index < opts.repeat; index += 1) {
    const run = await runBench(opts);
    if (!isBenchRunResult(run)) throw new Error("Request probes cannot be aggregated as performance runs.");
    runs.push(run);
  }
  return {
    repeat: opts.repeat,
    aggregate: {
      frameP95MsMedian: median(runs.map((run) => numberAt(run.end, ["frameMs", "p95"]) ?? Number.POSITIVE_INFINITY)),
      frameP95MsWorst: Math.max(...runs.map((run) => numberAt(run.end, ["frameMs", "p95"]) ?? Number.POSITIVE_INFINITY)),
      renderP95MsWorst: Math.max(...runs.map((run) => numberAt(run.end, ["renderMs", "p95"]) ?? Number.POSITIVE_INFINITY)),
      updateP95MsWorst: Math.max(...runs.map((run) => numberAt(run.end, ["updateMs", "p95"]) ?? Number.POSITIVE_INFINITY)),
      frameGapP95MsMedian: median(runs.map((run) => numberAt(run.end, ["frameGapMs", "p95"]) ?? Number.POSITIVE_INFINITY)),
      skippedFramesMedian: median(runs.map((run) => numberAt(run.end, ["frameBudget", "skippedFrames"]) ?? 0)),
      dtClampFramesMedian: median(runs.map((run) => numberAt(run.end, ["frameBudget", "dtClampFrames"]) ?? 0)),
      positiveHeapDeltaP95BytesMedian: median(runs.map((run) => numberAt(run.end, ["allocation", "positiveHeapDeltaBytes", "p95"]) ?? 0)),
      hotPhaseP95MsMedianTop: aggregatePhaseP95(runs)
    },
    runs
  };
}

type CdpRemoteArgument = { value?: unknown; description?: string };
type CdpRuntimeEvaluateResult = {
  result: CdpRemoteArgument;
  exceptionDetails?: unknown;
};
type CdpRuntimeDomain = {
  enable(): Promise<void>;
  evaluate(options: { expression: string; awaitPromise?: boolean; returnByValue?: boolean }): Promise<CdpRuntimeEvaluateResult>;
  exceptionThrown(listener: (event: { exceptionDetails: unknown }) => void): () => void;
  consoleAPICalled(listener: (event: { type: string; args?: CdpRemoteArgument[] }) => void): () => void;
};
type CdpPageDomain = {
  enable(): Promise<void>;
  navigate(options: { url: string }): Promise<void>;
  domContentEventFired(listener: () => void): () => void;
  captureScreenshot(options: { format: "png" }): Promise<{ data: string }>;
};
type CdpInputDomain = {
  dispatchKeyEvent(options: { type: "keyDown" | "keyUp"; windowsVirtualKeyCode: number; code: string; key: string }): Promise<void>;
};
type CdpEmulationDomain = {
  setDeviceMetricsOverride(options: { width: number; height: number; deviceScaleFactor: number; mobile: boolean }): Promise<void>;
};
type CdpDomains = {
  Emulation: CdpEmulationDomain;
  Input: CdpInputDomain;
  Page: CdpPageDomain;
  Runtime: CdpRuntimeDomain;
};
type CdpTarget = { id: string; webSocketDebuggerUrl: string };
function createCdpDomains(session: CdpSession): CdpDomains {
  const commandWithoutResult = async (method: string, params: UnknownRecord = {}) => {
    await session.command(method, params);
  };
  return {
    Emulation: {
      setDeviceMetricsOverride: (options) => commandWithoutResult("Emulation.setDeviceMetricsOverride", options)
    },
    Input: {
      dispatchKeyEvent: (options) => commandWithoutResult("Input.dispatchKeyEvent", options)
    },
    Page: {
      enable: () => commandWithoutResult("Page.enable"),
      navigate: (options) => commandWithoutResult("Page.navigate", options),
      domContentEventFired: (listener) => session.on("Page.domContentEventFired", () => listener()),
      async captureScreenshot(options) {
        const response = recordFrom(await session.command("Page.captureScreenshot", options));
        if (typeof response.data !== "string") throw new Error("CDP screenshot response omitted image data.");
        return { data: response.data };
      }
    },
    Runtime: {
      enable: () => commandWithoutResult("Runtime.enable"),
      async evaluate(options) {
        const response = recordFrom(await session.command("Runtime.evaluate", options));
        const remote = recordFrom(response.result);
        return {
          result: {
            value: remote.value,
            description: typeof remote.description === "string" ? remote.description : undefined
          },
          exceptionDetails: response.exceptionDetails
        };
      },
      exceptionThrown: (listener) => session.on("Runtime.exceptionThrown", (params) => {
        listener({ exceptionDetails: valueAt(params, ["exceptionDetails"]) });
      }),
      consoleAPICalled: (listener) => session.on("Runtime.consoleAPICalled", (params) => {
        const record = recordFrom(params);
        const rawArgs = Array.isArray(record.args) ? record.args : undefined;
        const args = rawArgs?.map((arg) => {
          const remote = recordFrom(arg);
          return {
            value: remote.value,
            description: typeof remote.description === "string" ? remote.description : undefined
          };
        });
        listener({ type: typeof record.type === "string" ? record.type : "unknown", args });
      })
    }
  };
}

async function cdpFetch(port: number, route: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`CDP HTTP ${response.status} for ${route}`);
    const value: unknown = await response.json();
    return value;
  } finally {
    clearTimeout(timer);
  }
}

async function createCdpTarget(port: number): Promise<CdpTarget> {
  const response = recordFrom(await cdpFetch(port, "/json/new?about%3Ablank", { method: "PUT" }));
  if (typeof response.id !== "string" || typeof response.webSocketDebuggerUrl !== "string") {
    throw new Error("CDP target response was malformed.");
  }
  return { id: response.id, webSocketDebuggerUrl: response.webSocketDebuggerUrl };
}

async function closeCdpTarget(port: number, id: string) {
  await cdpFetch(port, `/json/close/${encodeURIComponent(id)}`);
}

async function runCdpSelfTest() {
  const router = createCdpMessageRouter();
  const first = router.request("Test.first", {}, 1_000);
  const second = router.request("Test.second", {}, 1_000);
  router.accept(JSON.stringify({ id: second.id, result: { order: 2 } }));
  router.accept(JSON.stringify({ id: first.id, result: { order: 1 } }));
  const [firstResult, secondResult] = await Promise.all([first.promise, second.promise]);
  if (numberAt(firstResult, ["order"]) !== 1 || numberAt(secondResult, ["order"]) !== 2) {
    throw new Error("CDP request correlation self-test failed.");
  }

  let eventValue = 0;
  const remove = router.on("Test.event", (params) => {
    eventValue = numberAt(params, ["value"]) ?? 0;
  });
  router.accept(JSON.stringify({ method: "Test.event", params: { value: 7 } }));
  remove();
  router.accept(JSON.stringify({ method: "Test.event", params: { value: 9 } }));
  if (eventValue !== 7) throw new Error("CDP event routing self-test failed.");

  const pending = router.request("Test.pending", {}, 1_000).promise;
  router.close(new Error("expected close"));
  const rejection = await pending.then(() => "resolved", (error: unknown) => error instanceof Error ? error.message : String(error));
  if (rejection !== "expected close") throw new Error("CDP close rejection self-test failed.");
}

function isBenchRunResult(result: BenchRunResult | ProbeResult): result is BenchRunResult {
  return "end" in result;
}

async function runBench(opts: BenchOptions): Promise<BenchRunResult | ProbeResult> {
  let chrome: Awaited<ReturnType<typeof launchHeadlessBrowser>> | undefined;
  let client: CdpSession | undefined;
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  try {
    chrome = await launchChrome(opts);
    const port = chrome.port;
    const target = await createCdpTarget(port);
    client = await connectCdpSession(target.webSocketDebuggerUrl, "benchmark complete");
    const { Emulation, Input, Page, Runtime } = createCdpDomains(client);
    await Promise.all([Page.enable(), Runtime.enable()]);
    Runtime.exceptionThrown((event) => pageErrors.push(JSON.stringify(event.exceptionDetails)));
    Runtime.consoleAPICalled((event) => {
      const message = `${event.type}: ${(event.args ?? []).map((arg) => String(arg.value ?? arg.description ?? "")).join(" ")}`;
      if (!message.includes("GLTFLoader")) consoleMessages.push(message);
    });

    await Emulation.setDeviceMetricsOverride({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await Promise.all([
      waitForCdpEvent(Page.domContentEventFired, 30_000, "DOM content loaded"),
      Page.navigate({ url: withTelemetry(opts.url, opts) })
    ]);
    if (opts.probeRequest) {
      const result = await runRequestProbe({ Input, Page, Runtime }, { url: opts.url, consoleMessages, pageErrors });
      try {
        assertRequestProbeResult(result);
      } catch (error) {
        if (opts.out) {
          await mkdir(path.dirname(opts.out), { recursive: true });
          await writeFile(opts.out, `${JSON.stringify({ ...result, assertionError: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
        }
        throw error;
      }
      await closeCdpTarget(port, target.id).catch(() => undefined);
      return result;
    }
    try {
      await waitForRuntimeExpression(Runtime, "typeof globalThis.__threeArenaDebug === 'object'", 60_000);
    } catch (error) {
      const details = [...pageErrors, ...consoleMessages].join("\n");
      throw new Error(`${error instanceof Error ? error.message : String(error)}${details ? `\n${details}` : ""}`);
    }
    await waitForRuntimeExpression(Runtime, "globalThis.__threeArenaDebug?.snapshot?.().counters?.totalProps > 0 && Boolean(document.querySelector('#soloButton'))", 60_000);
    await delay(opts.warmupMs);
    await Runtime.evaluate({ expression: "document.querySelector('#soloButton')?.click()" });
    await waitForRuntimeExpression(Runtime, "globalThis.__threeArenaTelemetrySnapshot?.().running === true", 30_000);
    await delay(1_000);
    if (opts.stressEnemies > 0 || opts.stressPickups > 0 || opts.stressEffects > 0) {
      await Runtime.evaluate({
        awaitPromise: true,
        expression: `globalThis.__threeArenaBenchStress?.({ enemies: ${opts.stressEnemies}, pickups: ${opts.stressPickups}, effects: ${opts.stressEffects}, quietCombat: ${!opts.stressCombat}, allProps: ${opts.stressAllProps} })`
      });
      await waitForRuntimeExpression(Runtime, "globalThis.__threeArenaTelemetrySnapshot?.().assets?.optionalModelsReady === true", 45_000);
      await delay(1_000);
      await evaluateRuntime(Runtime, "globalThis.__threeArenaBenchResetTelemetry?.()");
    } else {
      await evaluateRuntime(Runtime, "globalThis.__threeArenaBenchResetTelemetry?.()");
    }
    const startSnapshot = await snapshot(Runtime);
    if (opts.moveMs > 0) {
      await evaluateRuntime(Runtime, `globalThis.__threeArenaBenchWalkSimulation?.({ ms: ${opts.moveMs}, render: true })`);
    } else {
      await delay(opts.durationMs);
    }
    const endSnapshot = await snapshot(Runtime);
    await closeCdpTarget(port, target.id).catch(() => undefined);

    const result: BenchRunResult = {
      url: opts.url,
      warmupMs: opts.warmupMs,
      moveMs: opts.moveMs,
      durationMs: opts.durationMs,
      stress: {
        enemies: opts.stressEnemies,
        pickups: opts.stressPickups,
        effects: opts.stressEffects,
        combat: opts.stressCombat,
        allProps: opts.stressAllProps
      },
      startedAt: new Date().toISOString(),
      start: startSnapshot,
      end: endSnapshot,
      delta: snapshotDelta(startSnapshot, endSnapshot),
      pageErrors,
      consoleMessages
    };
    try {
      assertBenchResult(result, opts);
    } catch (error) {
      if (opts.out) {
        await mkdir(path.dirname(opts.out), { recursive: true });
        await writeFile(opts.out, `${JSON.stringify({ ...result, assertionError: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
      }
      throw error;
    }
    return result;
  } finally {
    if (client) await client.close().catch(() => undefined);
    await chrome?.close();
  }
}

async function runRequestProbe(
  client: Pick<CdpDomains, "Input" | "Page" | "Runtime">,
  context: { url: string; consoleMessages: string[]; pageErrors: string[] }
): Promise<ProbeResult> {
  const { Input, Page, Runtime } = client;
  await waitForRuntimeExpression(Runtime, "typeof globalThis.__threeArenaDebug === 'object'", 45_000);
  await waitForRuntimeExpression(Runtime, "globalThis.__threeArenaDebug?.snapshot?.().counters?.totalProps > 0 && Boolean(document.querySelector('#soloButton'))", 60_000);
  await evaluateRuntime(Runtime, "document.querySelector('#soloButton')?.click()");
  await waitForRuntimeExpression(Runtime, "globalThis.__threeArenaTelemetrySnapshot?.().running === true", 30_000);
  await waitForRuntimeExpression(
    Runtime,
    "globalThis.__threeArenaDebug.snapshot().animation.engineMotion?.active === true",
    30_000,
  );
  await delay(1_200);

  const damage = await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.damageTable()");
  const props = await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.propBounds()");
  const fire = await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.fire('boneSplinter', 0)");
  const magnetStart = await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.activateMagnet(16)");
  await delay(700);
  const magnetAfter = await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.snapshot()");

  await evaluateRuntime(Runtime, "globalThis.__threeArenaBenchStress?.({ enemies: 0, pickups: 0, effects: 0, quietCombat: true })");
  await waitForRuntimeExpression(Runtime, "globalThis.__threeArenaDebug.snapshot().animation.playerLock <= 0.01", 10_000);
  await Input.dispatchKeyEvent({ type: "keyDown", windowsVirtualKeyCode: 87, code: "KeyW", key: "w" });
  await waitForRuntimeExpression(Runtime, "(() => { const s = globalThis.__threeArenaDebug.snapshot(); return s.movement.momentumSpeed >= s.movement.momentumMax * 0.8 && s.created.particles > 0; })()", 10_000);
  const moving = await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.snapshot()");
  await Input.dispatchKeyEvent({ type: "keyUp", windowsVirtualKeyCode: 87, code: "KeyW", key: "w" });
  await waitForRuntimeExpression(Runtime, "globalThis.__threeArenaDebug.snapshot().movement.momentumSpeed <= 1.2", 10_000);
  const damped = await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.snapshot()");

  await evaluateRuntime(Runtime, "globalThis.__threeArenaBenchStress?.({ enemies: 0, pickups: 0, effects: 0, quietCombat: true })");
  await delay(200);
  await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.jump()");
  await waitForRuntimeExpression(Runtime, `
    (() => {
      const snapshot = globalThis.__threeArenaDebug.snapshot();
      return snapshot.animation.player === "fall"
        && snapshot.animation.engineMotion?.phase === "fall"
        && snapshot.movement.grounded === false;
    })()
  `, 10_000);
  const falling = await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.snapshot()");
  await waitForRuntimeExpression(Runtime, `
    (() => {
      const played = globalThis.__threeArenaTelemetrySnapshot?.().animation?.played ?? {};
      const snapshot = globalThis.__threeArenaDebug.snapshot();
      return (played["engine-motion:land"] ?? played["universal:land"] ?? played["kenney:land"] ?? played["billboard:land"] ?? 0) >= 1 && snapshot.movement.grounded === true;
    })()
  `, 20_000);
  const landed = await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.snapshot()");

  const extremeAimPitch = Math.PI * 0.4;
  // Keep the replay samples in one JS turn so requestAnimationFrame cannot
  // advance gait/contact state between otherwise identical signal inputs.
  const aimProbes = await evaluateRuntime(Runtime, `
    (() => {
      const debug = globalThis.__threeArenaDebug;
      return {
        up: debug.probeEngineMotionAim(${extremeAimPitch}),
        upReplay: debug.probeEngineMotionAim(${extremeAimPitch}),
        down: debug.probeEngineMotionAim(${-extremeAimPitch}),
        downReplay: debug.probeEngineMotionAim(${-extremeAimPitch})
      };
    })()
  `);
  const aimUp = valueAt(aimProbes, ["up"]);
  const aimUpReplay = valueAt(aimProbes, ["upReplay"]);
  const aimDown = valueAt(aimProbes, ["down"]);
  const aimDownReplay = valueAt(aimProbes, ["downReplay"]);
  const recoil = await evaluateRuntime(Runtime, "globalThis.__threeArenaDebug.probeEngineMotionRecoil()");

  await mkdir(".local/screenshots/request-fix", { recursive: true });
  const screenshot = await Page.captureScreenshot({ format: "png" });
  await writeFile(".local/screenshots/request-fix/probe.png", Buffer.from(screenshot.data, "base64"));

  const result: ProbeResult = {
    url: context.url,
    probe: "request-fix",
    startedAt: new Date().toISOString(),
    damage,
    topProps: props,
    fire,
    magnet: {
      startActive: requiredBooleanAt(magnetStart, ["pickupsState", "magnetActive"]),
      startMagnetized: requiredNumberAt(magnetStart, ["pickupsState", "magnetized"]),
      afterActive: requiredBooleanAt(magnetAfter, ["pickupsState", "magnetActive"]),
      magnetized: requiredNumberAt(magnetAfter, ["pickupsState", "magnetized"]),
      particles: requiredNumberAt(magnetAfter, ["counters", "particles"]),
      effects: requiredNumberAt(magnetAfter, ["counters", "effects"])
    },
    movement: {
      moving: requiredRecordAt(moving, ["movement"]),
      damped: requiredRecordAt(damped, ["movement"]),
      particlesBeforeMove: requiredNumberAt(magnetAfter, ["created", "particles"]),
      particlesAfterMove: requiredNumberAt(moving, ["created", "particles"]),
      playerAnimation: valueAt(moving, ["animation", "player"]),
      playerState: valueAt(moving, ["animation", "playerState"]),
      playerSource: valueAt(moving, ["animation", "playerSource"])
    },
    air: {
      falling: {
        player: valueAt(falling, ["animation", "player"]),
        state: valueAt(falling, ["animation", "playerState"]),
        phase: valueAt(falling, ["animation", "engineMotion", "phase"]),
        grounded: requiredBooleanAt(falling, ["movement", "grounded"]),
        jumpY: requiredNumberAt(falling, ["movement", "jumpY"])
      },
      landed: {
        played: requiredRecordAt(landed, ["animation", "played"]),
        phase: valueAt(landed, ["animation", "engineMotion", "phase"]),
        grounded: requiredBooleanAt(landed, ["movement", "grounded"]),
        jumpY: requiredNumberAt(landed, ["movement", "jumpY"])
      }
    },
    engineMotion: {
      baseline: parseEngineMotionSnapshotProbe(
        valueAt(moving, ["animation", "engineMotion"]),
        "moving.animation.engineMotion",
      ),
      landed: parseEngineMotionSnapshotProbe(
        valueAt(landed, ["animation", "engineMotion"]),
        "landed.animation.engineMotion",
      ),
      extremeAim: {
        pitchRadians: extremeAimPitch,
        up: parseEngineMotionSnapshotProbe(aimUp, "probeEngineMotionAim(up)"),
        upReplay: parseEngineMotionSnapshotProbe(aimUpReplay, "probeEngineMotionAim(up replay)"),
        down: parseEngineMotionSnapshotProbe(aimDown, "probeEngineMotionAim(down)"),
        downReplay: parseEngineMotionSnapshotProbe(aimDownReplay, "probeEngineMotionAim(down replay)"),
      },
      recoil: parseEngineMotionRecoilProbe(recoil, "probeEngineMotionRecoil()"),
    },
    tuning: valueAt(landed, ["tuning"]),
    pageErrors: context.pageErrors,
    consoleMessages: context.consoleMessages
  };
  return result;
}

async function evaluateRuntime(Runtime: CdpRuntimeDomain, expression: string): Promise<unknown> {
  const result = await Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function waitForRuntimeExpression(Runtime: CdpRuntimeDomain, expression: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await evaluateRuntime(Runtime, expression)) return;
    } catch {
      // Page globals are created during async boot.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

function assertRequestProbeResult(result: ProbeResult) {
  const failures: string[] = [];
  try {
    assertEngineMotionRequestProbe(result.engineMotion);
  } catch (error) {
    failures.push(`engine motion: ${error instanceof Error ? error.message : String(error)}`);
  }
  const touches = Object.values(recordFrom(result.damage)).map((entry) => requiredNumberAt(entry, ["touch"]));
  if (!touches.length) failures.push("damage table was empty");
  if (Math.min(...touches) !== 25) failures.push(`min damage ${Math.min(...touches)} != 25`);
  if (Math.max(...touches) !== 75) failures.push(`max damage ${Math.max(...touches)} != 75`);
  const topProp = Array.isArray(result.topProps) ? recordFrom(result.topProps[0]) : {};
  const topPropMax = numberAt(topProp, ["max"]);
  if (topPropMax !== undefined && topPropMax > 35) failures.push(`largest prop too big: ${String(topProp.model ?? "unknown")} ${topPropMax}`);
  const bullet = optionalRecordAt(result.fire, ["bullet"]);
  const muzzle = optionalRecordAt(result.fire, ["muzzle"]);
  const bulletY = numberAt(bullet, ["y"]);
  const muzzleY = numberAt(muzzle, ["y"]);
  const bulletX = numberAt(bullet, ["x"]);
  const muzzleX = numberAt(muzzle, ["x"]);
  if (bulletY === undefined || muzzleY === undefined || Math.abs(bulletY - muzzleY) > 0.02) failures.push(`bullet y not at muzzle: ${JSON.stringify(result.fire)}`);
  if (bulletX === undefined || muzzleX === undefined || Math.abs((bulletX - muzzleX) - 0.12) > 0.03) failures.push(`bullet x not from muzzle: ${JSON.stringify(result.fire)}`);
  if (!result.magnet.afterActive || result.magnet.startMagnetized < 8) failures.push("magnet pull inactive or weak");
  const movingSpeed = requiredNumberAt(result.movement.moving, ["momentumSpeed"]);
  const movingMax = requiredNumberAt(result.movement.moving, ["momentumMax"]);
  if (movingSpeed < movingMax * 0.8) failures.push("momentum did not build to dust threshold");
  if (result.movement.particlesAfterMove <= result.movement.particlesBeforeMove) failures.push("momentum dust particles not added");
  const dampedSpeed = requiredNumberAt(result.movement.damped, ["momentumSpeed"]);
  if (dampedSpeed > 1.2) failures.push(`momentum did not damp: ${dampedSpeed}`);
  if (!isRunAnimation(result.movement.playerAnimation) || !isPlayableAnimationSource(result.movement.playerSource)) {
    failures.push(`ground run animation not active: ${result.movement.playerAnimation}/${result.movement.playerSource}`);
  }
  if (result.air.falling.player !== "fall" || result.air.falling.phase !== "fall" || result.air.falling.grounded) {
    failures.push(`fall animation not active in air: ${String(result.air.falling.player)}/${String(result.air.falling.phase)}`);
  }
  const playedLand = numberOrZero(result.air.landed.played["universal:land"])
    || numberOrZero(result.air.landed.played["kenney:land"])
    || numberOrZero(result.air.landed.played["engine-motion:land"])
    || numberOrZero(result.air.landed.played["billboard:land"]);
  if (playedLand < 1 || result.air.landed.phase !== "land" || !result.air.landed.grounded) {
    failures.push(`land animation did not play on touchdown: ${playedLand}/${String(result.air.landed.phase)}`);
  }
  const realErrors = [...(result.pageErrors ?? []), ...(result.consoleMessages ?? [])].filter((message) => !String(message).includes("Multiple instances of Three.js"));
  if (realErrors.length) failures.push(`browser errors: ${realErrors.join(" | ")}`);
  if (failures.length) throw new Error(failures.join("\n"));
}

async function snapshot(Runtime: CdpRuntimeDomain): Promise<UnknownRecord> {
  const result = await Runtime.evaluate({
    awaitPromise: true,
    returnByValue: true,
    expression: "globalThis.__threeArenaTelemetrySnapshot?.() ?? null"
  });
  if (!isRecord(result.result.value)) throw new Error("Three Arena telemetry snapshot was unavailable or malformed.");
  return recordFrom(result.result.value);
}

function parseArgs(argv: string[]): BenchOptions {
  const opts: BenchOptions = {
    url: "http://localhost:8793/client.html",
    warmupMs: 6_500,
    durationMs: 15_000,
    moveMs: 0,
    stressEnemies: 0,
    stressPickups: 0,
    stressEffects: 0,
    stressAllProps: false,
    repeat: 1,
    disableGpu: false,
    allowConsole: false,
    stressCombat: false,
    probeRequest: false,
    selfTestCdp: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") opts.url = requiredValue(argv, ++i, arg);
    else if (arg === "--warmup-ms") opts.warmupMs = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--duration-ms") opts.durationMs = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--move-ms") opts.moveMs = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--stress-enemies") opts.stressEnemies = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--stress-pickups") opts.stressPickups = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--stress-effects") opts.stressEffects = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--stress-all-props") opts.stressAllProps = true;
    else if (arg === "--repeat") opts.repeat = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--disable-gpu") opts.disableGpu = true;
    else if (arg === "--allow-console") opts.allowConsole = true;
    else if (arg === "--stress-combat") opts.stressCombat = true;
    else if (arg === "--probe-request") opts.probeRequest = true;
    else if (arg === "--self-test-cdp") opts.selfTestCdp = true;
    else if (arg === "--assert-frame-p95-ms") opts.assertFrameP95Ms = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-update-p95-ms") opts.assertUpdateP95Ms = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-render-p95-ms") opts.assertRenderP95Ms = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-draw-calls-max") opts.assertDrawCallsMax = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-triangles-max") opts.assertTrianglesMax = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-programs-max") opts.assertProgramsMax = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-enemies") opts.assertEnemies = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-pickups") opts.assertPickups = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-particles") opts.assertParticles = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-animated-enemies-max") opts.assertAnimatedEnemiesMax = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-mesh-delta-max") opts.assertMeshDeltaMax = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-material-delta-max") opts.assertMaterialDeltaMax = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--assert-heap-delta-max-mb") opts.assertHeapDeltaMaxMb = Number(requiredValue(argv, ++i, arg));
    else if (arg === "--out") opts.out = requiredValue(argv, ++i, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(opts.repeat) || opts.repeat < 1) throw new Error("--repeat must be a positive integer");
  requireFiniteNumber("--warmup-ms", opts.warmupMs, 0);
  requireFiniteNumber("--duration-ms", opts.durationMs, 1);
  requireFiniteNumber("--move-ms", opts.moveMs, 0);
  requireNonNegativeInteger("--stress-enemies", opts.stressEnemies);
  requireNonNegativeInteger("--stress-pickups", opts.stressPickups);
  requireNonNegativeInteger("--stress-effects", opts.stressEffects);
  for (const [name, value] of [
    ["--assert-frame-p95-ms", opts.assertFrameP95Ms],
    ["--assert-update-p95-ms", opts.assertUpdateP95Ms],
    ["--assert-render-p95-ms", opts.assertRenderP95Ms],
    ["--assert-draw-calls-max", opts.assertDrawCallsMax],
    ["--assert-triangles-max", opts.assertTrianglesMax],
    ["--assert-programs-max", opts.assertProgramsMax],
    ["--assert-enemies", opts.assertEnemies],
    ["--assert-pickups", opts.assertPickups],
    ["--assert-particles", opts.assertParticles],
    ["--assert-animated-enemies-max", opts.assertAnimatedEnemiesMax],
    ["--assert-mesh-delta-max", opts.assertMeshDeltaMax],
    ["--assert-material-delta-max", opts.assertMaterialDeltaMax],
    ["--assert-heap-delta-max-mb", opts.assertHeapDeltaMaxMb]
  ] as const) {
    if (value !== undefined) requireFiniteNumber(name, value, 0);
  }
  const url = new URL(opts.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("--url must use http: or https:");
  if (opts.probeRequest && opts.repeat !== 1) throw new Error("--probe-request requires --repeat 1");
  return opts;
}

function requireFiniteNumber(name: string, value: number, minimum: number) {
  if (!Number.isFinite(value) || value < minimum) throw new Error(`${name} must be a finite number >= ${minimum}`);
}

function requireNonNegativeInteger(name: string, value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`);
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function withTelemetry(rawUrl: string, opts: BenchOptions) {
  const url = new URL(rawUrl);
  const params = new URLSearchParams(url.search.replace(/;/g, "&"));
  params.set("telemetry", "1");
  if (!opts.probeRequest && (opts.stressEnemies > 0 || opts.stressPickups > 0 || opts.stressEffects > 0) && !params.has("animatedEnemies")) {
    params.set("animatedEnemies", "0");
  }
  if (!opts.probeRequest && opts.moveMs > 0 && !params.has("benchNoLevelChoices")) {
    params.set("benchNoLevelChoices", "1");
  }
  if (!opts.probeRequest && opts.moveMs > 0 && !params.has("benchInvulnerable")) {
    params.set("benchInvulnerable", "1");
  }
  if (!opts.probeRequest && opts.moveMs > 0 && !params.has("benchWalkOnly")) {
    params.set("benchWalkOnly", "1");
  }
  if (!opts.probeRequest && opts.moveMs > 0 && !params.has("shadows")) {
    params.set("shadows", "0");
  }
  if (!opts.probeRequest && opts.moveMs > 0 && !params.has("telemetryPanel")) {
    params.set("telemetryPanel", "0");
  }
  url.search = params.toString();
  return url.toString();
}

async function launchChrome(opts: BenchOptions) {
  const failures: string[] = [];
  for (const executable of chromeCandidates()) {
    if (path.isAbsolute(executable) && !existsSync(executable)) continue;
    try {
      return await launchHeadlessBrowser({ executable, args: opts.disableGpu ? ["--disable-gpu"] : [] });
    } catch (error) {
      failures.push(`${executable}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No Chrome executable found. Set CHROME_PATH to benchmark.${failures.length ? ` Attempts: ${failures.join(" | ")}` : ""}`);
}

function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    path.join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.PROGRAMFILES ?? "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Microsoft/Edge/Application/msedge.exe")
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForCdpEvent(register: (listener: () => void) => () => void, timeoutMs: number, label: string) {
  return new Promise<void>((resolve, reject) => {
    let remove: () => void = () => undefined;
    const timer = setTimeout(() => {
      remove();
      reject(new Error(`Timed out waiting for CDP event: ${label}`));
    }, timeoutMs);
    remove = register(() => {
      clearTimeout(timer);
      remove();
      resolve();
    });
  });
}

import { isRecord, recordFrom, valueAt, numberAt, requiredNumberAt, requiredBooleanAt, optionalRecordAt, requiredRecordAt, snapshotDelta, assertBenchResult, isRunAnimation, isPlayableAnimationSource, numberOrZero, aggregatePhaseP95, median } from "./bench/validation.ts";
