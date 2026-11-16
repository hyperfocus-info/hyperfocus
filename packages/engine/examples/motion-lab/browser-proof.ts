import { isRecord } from "@hyperfocus/utilities/records";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { connectCdpSession, type CdpSession } from "@hyperfocus/engine/tooling/cdp-client";
import { LAB_SCENARIO_IDS, type LabControls, type LabScenarioId } from "./src/scenarios.ts";
import { MOTION_LAB_FIXTURE_IDS, type MotionLabFixtureId } from "./src/fixture-repository.ts";

const FIXED_CAPTURE_WIDTH = 1440;
const FIXED_CAPTURE_HEIGHT = 900;
const FOOT_SLIP_LIMIT_METERS = 0.02;
const PLANTED_VERTICAL_ERROR_LIMIT_METERS = 1e-4;
const DEFAULT_STEPS = 180;
const VIEW_IDS = ["side", "front", "aim"] as const;

type ViewId = (typeof VIEW_IDS)[number];
type UnknownRecord = Record<string, unknown>;

export type BrowserProofOptions = {
  chromePath?: string;
  outDir: string;
  skipBuild: boolean;
  steps: number;
};

export type BrowserAcceptanceEntry = {
  fixture: MotionLabFixtureId;
  scenario: LabScenarioId;
  capabilities: {
    leftFootPlanting: boolean;
    rightFootPlanting: boolean;
  };
  metrics: {
    footSlipMeters: number | null;
    nanCount: number;
    plantedVerticalErrorMeters: number | null;
  };
  poseChecksums: Readonly<Record<ViewId, string>>;
};

type CapturedCase = {
  dataUrl: string;
  entry: BrowserAcceptanceEntry;
};

type CdpTarget = {
  id: string;
  webSocketDebuggerUrl: string;
};

export function parseBrowserProofOptions(
  args: readonly string[],
  cwd = process.cwd(),
): BrowserProofOptions {
  const options: BrowserProofOptions = {
    outDir: path.resolve(cwd, ".local", "motion-lab"),
    skipBuild: false,
    steps: DEFAULT_STEPS,
  };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--no-build") {
      options.skipBuild = true;
      continue;
    }
    const value = args[index + 1];
    if (key === "--out-dir") {
      if (!value) throw new Error("--out-dir requires a path");
      options.outDir = path.resolve(cwd, value);
    } else if (key === "--steps") {
      options.steps = positiveInteger(value, key);
    } else if (key === "--chrome") {
      if (!value) throw new Error("--chrome requires an executable path");
      options.chromePath = path.resolve(cwd, value);
    } else {
      throw new Error(`Unknown motion-lab browser-proof option: ${String(key)}`);
    }
    index += 1;
  }
  return options;
}

export function validateAcceptanceEntries(
  entries: readonly BrowserAcceptanceEntry[],
): string[] {
  const failures: string[] = [];
  for (const entry of entries) {
    const label = `${entry.fixture}/${entry.scenario}`;
    if (entry.metrics.nanCount !== 0) failures.push(`${label}: ${entry.metrics.nanCount} non-finite pose transforms`);
    const plantingEnabled = entry.capabilities.leftFootPlanting || entry.capabilities.rightFootPlanting;
    if (!plantingEnabled) continue;
    const slip = entry.metrics.footSlipMeters;
    if (slip === null || !Number.isFinite(slip)) {
      failures.push(`${label}: foot-slip metric missing while planting is enabled`);
    } else if (slip >= FOOT_SLIP_LIMIT_METERS) {
      failures.push(`${label}: foot slip ${slip.toFixed(6)}m is not below ${FOOT_SLIP_LIMIT_METERS}m`);
    }
    const verticalError = entry.metrics.plantedVerticalErrorMeters;
    if (verticalError === null || !Number.isFinite(verticalError)) {
      failures.push(`${label}: planted vertical-error metric missing while planting is enabled`);
    } else if (verticalError > PLANTED_VERTICAL_ERROR_LIMIT_METERS) {
      failures.push(
        `${label}: planted vertical error ${verticalError.toExponential(6)}m exceeds ${PLANTED_VERTICAL_ERROR_LIMIT_METERS}m`,
      );
    }
  }
  return failures;
}

async function runBrowserProof(options: BrowserProofOptions) {
  await mkdir(options.outDir, { recursive: true });
  if (!options.skipBuild) await runCommand(process.execPath, [path.join(import.meta.dir, "build.ts")], "motion-lab build");

  const serverPort = await findOpenPort();
  let server: ReturnType<typeof spawnBackgroundProcess> | undefined;
  let chrome: Awaited<ReturnType<typeof launchHeadlessBrowser>> | undefined;
  let session: CdpSession | undefined;
  let target: CdpTarget | undefined;
  const pageErrors: string[] = [];
  const consoleMessages: string[] = [];

  try {
    server = spawnBackgroundProcess({ cmd: [process.execPath, path.join(import.meta.dir, "server.ts")],
      cwd: path.resolve(import.meta.dir, "..", ".."),
      env: { ...process.env, MOTION_LAB_HOST: "127.0.0.1", MOTION_LAB_PORT: String(serverPort) },
      stdout: "ignore", stderr: "inherit",
    });
    await waitForLabServer(serverPort, server);
    chrome = await launchChrome(options.chromePath);
    target = await createCdpTarget(chrome.port);
    session = await connectCdpSession(target.webSocketDebuggerUrl, "motion proof complete");
    await Promise.all([
      session.command("Page.enable"),
      session.command("Runtime.enable"),
      session.command("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 1,
        height: FIXED_CAPTURE_HEIGHT,
        mobile: false,
        width: FIXED_CAPTURE_WIDTH,
      }),
    ]);
    session.on("Runtime.exceptionThrown", (params) => {
      pageErrors.push(JSON.stringify(valueAt(params, ["exceptionDetails"]) ?? params));
    });
    session.on("Runtime.consoleAPICalled", (params) => {
      const record = recordFrom(params);
      const args = Array.isArray(record.args) ? record.args : [];
      const message = args.map((argument) => {
        const remote = recordFrom(argument);
        return String(remote.value ?? remote.description ?? "");
      }).join(" ");
      consoleMessages.push(`${String(record.type ?? "unknown")}: ${message}`);
    });

    const url = `http://127.0.0.1:${serverPort}/`;
    await session.command("Page.navigate", { url });
    await waitForRuntimeExpression(
      session,
      "globalThis.__motionLab?.ready === true && globalThis.__motionLab?.captureReady === true",
      60_000,
      "motion laboratory readiness",
    );
    await evaluateRuntime(session, "globalThis.__motionLab.pause(); true");

    const matrix: BrowserAcceptanceEntry[] = [];
    for (const fixture of MOTION_LAB_FIXTURE_IDS) {
      for (const scenario of LAB_SCENARIO_IDS) {
        matrix.push(await driveCase(session, fixture, scenario, options.steps));
      }
    }

    const canonicalSlope = matrix.find((entry) => entry.fixture === "canonical" && entry.scenario === "slope");
    if (!canonicalSlope) throw new Error("Canonical slope matrix entry is missing");
    const replay = await driveCase(session, "canonical", "slope", options.steps);
    const deterministicReplay = VIEW_IDS.every(
      (view) => replay.poseChecksums[view] === canonicalSlope.poseChecksums[view],
    );

    const slopeCapture = await captureCase(session, "slope", "side", options.steps, {
      aimPitchDegrees: 38,
      aimYawDegrees: 18,
      speedMetersPerSecond: 2.4,
    });
    const strafeCapture = await captureCase(session, "strafe", "front", options.steps, {
      aimPitchDegrees: 38,
      aimYawDegrees: 18,
      speedMetersPerSecond: 2.4,
    });
    const aimUpCapture = await captureCase(session, "aim", "aim", 1, {
      aimPitchDegrees: 55,
      aimYawDegrees: 0,
      speedMetersPerSecond: 0,
    });
    const aimDownCapture = await captureCase(session, "aim", "aim", 1, {
      aimPitchDegrees: -55,
      aimYawDegrees: 0,
      speedMetersPerSecond: 0,
    });
    const captureEntries = [
      slopeCapture.entry,
      strafeCapture.entry,
      aimUpCapture.entry,
      aimDownCapture.entry,
    ];
    const failures = [
      ...validateAcceptanceEntries(matrix),
      ...validateAcceptanceEntries(captureEntries),
      ...pageErrors.map((error) => `page exception: ${error}`),
    ];
    if (!deterministicReplay) failures.push("canonical/slope fixed-step replay produced different pose checksums");

    await installAcceptanceSheet(session, {
      aimDown: aimDownCapture.dataUrl,
      aimUp: aimUpCapture.dataUrl,
      sideSlope: slopeCapture.dataUrl,
      frontStrafe: strafeCapture.dataUrl,
    }, failures.length === 0);
    const screenshotResponse = recordFrom(await session.command("Page.captureScreenshot", {
      captureBeyondViewport: false,
      clip: { height: FIXED_CAPTURE_HEIGHT, scale: 1, width: FIXED_CAPTURE_WIDTH, x: 0, y: 0 },
      format: "png",
      fromSurface: true,
    }));
    if (typeof screenshotResponse.data !== "string") throw new Error("CDP screenshot response omitted PNG data");
    const png = Buffer.from(screenshotResponse.data, "base64");
    const pngPath = path.join(options.outDir, "acceptance.png");
    await writeFile(pngPath, png);

    const result = {
      schemaVersion: 1,
      proof: "motion-lab-browser-acceptance",
      passed: failures.length === 0,
      thresholds: {
        footSlipMetersExclusive: FOOT_SLIP_LIMIT_METERS,
        plantedVerticalErrorMetersInclusive: PLANTED_VERTICAL_ERROR_LIMIT_METERS,
        nanCount: 0,
      },
      fixedStepSeconds: 0.016666666666666666,
      stepsPerCase: options.steps,
      fixtures: MOTION_LAB_FIXTURE_IDS,
      scenarios: LAB_SCENARIO_IDS,
      matrix,
      deterministicReplay: {
        fixture: "canonical",
        scenario: "slope",
        passed: deterministicReplay,
        first: canonicalSlope.poseChecksums,
        replay: replay.poseChecksums,
      },
      capture: {
        file: "acceptance.png",
        width: FIXED_CAPTURE_WIDTH,
        height: FIXED_CAPTURE_HEIGHT,
        sha256: createHash("sha256").update(png).digest("hex"),
        columns: [
          { view: "side", scenario: "slope", label: "15-degree slope" },
          { view: "front", scenario: "strafe", label: "strafe" },
          { view: "aim", scenario: "aim", label: "split +55/-55 degrees" },
        ],
        cases: captureEntries,
      },
      browserDiagnostics: { consoleMessages, pageErrors },
      failures,
    };
    const jsonPath = path.join(options.outDir, "acceptance.json");
    await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({
      passed: result.passed,
      matrixCases: matrix.length,
      json: jsonPath,
      png: pngPath,
      pngSha256: result.capture.sha256,
    }, null, 2));
    if (failures.length > 0) throw new Error(`Motion-lab browser proof failed:\n${failures.join("\n")}`);
    return result;
  } finally {
    if (target && chrome) await closeCdpTarget(chrome.port, target.id).catch(() => undefined);
    await session?.close().catch(() => undefined);
    try { await chrome?.close(); }
    finally { if (server) await terminateProcessTree({ process: server }); }
  }
}

async function driveCase(
  session: CdpSession,
  fixture: MotionLabFixtureId,
  scenario: LabScenarioId,
  steps: number,
  controls?: Partial<LabControls>,
): Promise<BrowserAcceptanceEntry> {
  const expression = `(async () => {
    const lab = globalThis.__motionLab;
    await lab.setFixture(${JSON.stringify(fixture)});
    lab.pause();
    lab.setControls(${JSON.stringify(controls ?? {
      aimPitchDegrees: 38,
      aimYawDegrees: 18,
      speedMetersPerSecond: 2.4,
    })});
    lab.setScenario(${JSON.stringify(scenario)});
    lab.advanceFixed(${steps});
    return lab.snapshot();
  })()`;
  const snapshot = await evaluateRuntime(session, expression, true);
  return acceptanceEntryFromSnapshot(snapshot, fixture, scenario);
}

async function captureCase(
  session: CdpSession,
  scenario: LabScenarioId,
  view: ViewId,
  steps: number,
  controls: LabControls,
): Promise<CapturedCase> {
  const entry = await driveCase(session, "canonical", scenario, steps, controls);
  const dataUrl = await evaluateRuntime(
    session,
    `globalThis.__motionLab.captureViewDataUrl(${JSON.stringify(view)})`,
  );
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error(`${view}/${scenario} capture did not return a PNG data URL`);
  }
  return { dataUrl, entry };
}

function acceptanceEntryFromSnapshot(
  snapshot: unknown,
  fixture: MotionLabFixtureId,
  scenario: LabScenarioId,
): BrowserAcceptanceEntry {
  const views = requiredRecordAt(snapshot, ["views"]);
  let nanCount = 0;
  let footSlip: number | null = null;
  let plantedVerticalError: number | null = null;
  let leftFootPlanting: boolean | null = null;
  let rightFootPlanting: boolean | null = null;
  const poseChecksums: Record<ViewId, string> = { side: "", front: "", aim: "" };
  for (const view of VIEW_IDS) {
    const viewSnapshot = requiredRecordAt(views, [view]);
    const capabilities = requiredRecordAt(viewSnapshot, ["capabilities"]);
    const metrics = requiredRecordAt(viewSnapshot, ["metrics"]);
    const viewLeft = requiredBooleanAt(capabilities, ["leftFootPlanting"]);
    const viewRight = requiredBooleanAt(capabilities, ["rightFootPlanting"]);
    if (leftFootPlanting !== null && leftFootPlanting !== viewLeft) {
      throw new Error(`${fixture}/${scenario}: left-foot capability differs between views`);
    }
    if (rightFootPlanting !== null && rightFootPlanting !== viewRight) {
      throw new Error(`${fixture}/${scenario}: right-foot capability differs between views`);
    }
    leftFootPlanting = viewLeft;
    rightFootPlanting = viewRight;
    nanCount = Math.max(nanCount, requiredNumberAt(metrics, ["nanCount"]));
    const viewSlip = nullableFiniteNumberAt(metrics, ["footSlipMeters"]);
    const viewVertical = nullableFiniteNumberAt(metrics, ["plantedVerticalErrorMeters"]);
    if (viewSlip !== null) footSlip = Math.max(footSlip ?? 0, viewSlip);
    if (viewVertical !== null) plantedVerticalError = Math.max(plantedVerticalError ?? 0, viewVertical);
    poseChecksums[view] = requiredStringAt(metrics, ["poseChecksum"]);
  }
  return {
    fixture,
    scenario,
    capabilities: {
      leftFootPlanting: leftFootPlanting ?? false,
      rightFootPlanting: rightFootPlanting ?? false,
    },
    metrics: {
      footSlipMeters: footSlip,
      nanCount,
      plantedVerticalErrorMeters: plantedVerticalError,
    },
    poseChecksums,
  };
}

async function installAcceptanceSheet(
  session: CdpSession,
  images: { aimDown: string; aimUp: string; frontStrafe: string; sideSlope: string },
  passed: boolean,
) {
  const css = `
    *{box-sizing:border-box}
    .proof{width:${FIXED_CAPTURE_WIDTH}px;height:${FIXED_CAPTURE_HEIGHT}px;padding:22px;display:grid;grid-template-rows:70px 1fr 30px;gap:12px;background:radial-gradient(circle at 50% -25%,#17252a 0,#080b0e 48%)}
    .proof-header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #2b353e;padding:0 4px 14px}
    .proof-kicker{margin:0 0 5px;color:#a7ff4f;font:700 11px ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase}
    .proof-title{margin:0;font-size:32px;line-height:1;letter-spacing:-.04em}
    .proof-meta{color:#8d9aa6;font:12px ui-monospace,monospace;text-align:right}
    .columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;min-height:0}
    .panel{min-width:0;display:grid;grid-template-rows:54px 1fr;overflow:hidden;border:1px solid #2b353e;border-radius:9px;background:#10151a}
    .panel-head{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;border-bottom:1px solid #202932}
    .panel-label{margin:0 0 3px;color:#a7ff4f;font:700 9px ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}
    .panel-title{margin:0;font-size:17px}
    .panel-detail{color:#8d9aa6;font:10px ui-monospace,monospace;text-align:right}
    .frame{min-height:0;display:flex;align-items:center;justify-content:center;background:#0c1014;overflow:hidden}
    .frame>img{display:block;width:100%;height:100%;object-fit:contain}
    .aim-grid{min-height:0;display:grid;grid-template-rows:1fr 1fr;gap:1px;background:#2b353e}
    .aim-frame{position:relative;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#0c1014}
    .aim-frame img{display:block;width:100%;height:100%;object-fit:contain}
    .aim-tag{position:absolute;top:10px;left:10px;padding:5px 8px;border:1px solid #36434d;border-radius:999px;background:#10151adc;color:#ffbd4a;font:700 10px ui-monospace,monospace}
    .proof-footer{display:flex;align-items:center;justify-content:space-between;color:#8d9aa6;font:10px ui-monospace,monospace}
    .pass{color:#a7ff4f}
    .fail{color:#ff6b66}
  `;
  const markup = `
    <header class="proof-header"><div><p class="proof-kicker">Catalog Engine / deterministic browser proof</p><h1 class="proof-title">Motion Laboratory Acceptance</h1></div><div class="proof-meta">canonical zero-clip fixture<br>fixed step / 60 Hz</div></header>
    <section class="columns">
      <article class="panel"><header class="panel-head"><div><p class="panel-label">Contact proof</p><h2 class="panel-title">Side</h2></div><span class="panel-detail">15-degree slope</span></header><div class="frame"><img id="proof-side" alt="Side view running on a slope"></div></article>
      <article class="panel"><header class="panel-head"><div><p class="panel-label">Silhouette proof</p><h2 class="panel-title">Front</h2></div><span class="panel-detail">strafe</span></header><div class="frame"><img id="proof-front" alt="Front view strafing"></div></article>
      <article class="panel"><header class="panel-head"><div><p class="panel-label">Briefcase test</p><h2 class="panel-title">Perspective</h2></div><span class="panel-detail">distributed aim</span></header><div class="aim-grid"><div class="aim-frame"><img id="proof-up" alt="Perspective view aiming up"><span class="aim-tag">AIM +55 DEG</span></div><div class="aim-frame"><img id="proof-down" alt="Perspective view aiming down"><span class="aim-tag">AIM -55 DEG</span></div></div></article>
    </section>
    <footer class="proof-footer"><span>contacts &gt; silhouette / no authored clips</span><span class="${passed ? "pass" : "fail"}">${passed ? "FINITE POSE / PLANT GATES VERIFIED" : "ACCEPTANCE GATE FAILED / SEE JSON"}</span></footer>
  `;
  const expression = `(async () => {
    const images = ${JSON.stringify(images)};
    document.documentElement.style.cssText = "margin:0;width:${FIXED_CAPTURE_WIDTH}px;height:${FIXED_CAPTURE_HEIGHT}px;background:#080b0e";
    document.body.style.cssText = "margin:0;width:${FIXED_CAPTURE_WIDTH}px;height:${FIXED_CAPTURE_HEIGHT}px;overflow:hidden;background:#080b0e;color:#edf3f6;font-family:Inter,system-ui,sans-serif";
    const style = document.createElement("style");
    style.textContent = ${JSON.stringify(css)};
    const root = document.createElement("main");
    root.className = "proof";
    root.innerHTML = ${JSON.stringify(markup)};
    document.head.replaceChildren(style);
    document.body.replaceChildren(root);
    root.querySelector("#proof-side").src = images.sideSlope;
    root.querySelector("#proof-front").src = images.frontStrafe;
    root.querySelector("#proof-up").src = images.aimUp;
    root.querySelector("#proof-down").src = images.aimDown;
    await Promise.all([...root.querySelectorAll("img")].map((image) => image.decode()));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  })()`;
  await evaluateRuntime(session, expression, true);
}

async function evaluateRuntime(
  session: CdpSession,
  expression: string,
  awaitPromise = false,
): Promise<unknown> {
  const response = recordFrom(await session.command("Runtime.evaluate", {
    awaitPromise,
    expression,
    returnByValue: true,
  }, 60_000));
  if (response.exceptionDetails !== undefined) {
    throw new Error(`Browser evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
  }
  const result = recordFrom(response.result);
  if (result.subtype === "error") {
    throw new Error(typeof result.description === "string" ? result.description : "Browser evaluation returned an error");
  }
  return result.value;
}

async function waitForRuntimeExpression(
  session: CdpSession,
  expression: string,
  timeoutMs: number,
  label: string,
) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (await evaluateRuntime(session, `Boolean(${expression})`) === true) return;
    await delay(60);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function runCommand(executable: string, args: readonly string[], label: string) {
  const child = spawnBackgroundProcess({ cmd: [executable, ...args],
    cwd: path.resolve(import.meta.dir, "..", ".."),
    timeout: 600000,
  });
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited
    ]);
    if (code !== 0) throw new Error(`${label} exited with ${code}: ${stderr.trim() || stdout.trim()}`);
  } finally { await terminateProcessTree({ process: child }); }
}

async function waitForLabServer(port: number, process: ReturnType<typeof spawnBackgroundProcess>) {
  const started = performance.now();
  while (performance.now() - started < 15_000) {
    if (process.exitCode !== null) {
      throw new Error(`Motion-lab server exited before readiness (${process.exitCode})`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // Server startup is asynchronous.
    }
    await delay(60);
  }
  throw new Error("Motion-lab server did not become ready");
}

async function launchChrome(explicitPath?: string) {
  const args = [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    `--window-size=${FIXED_CAPTURE_WIDTH},${FIXED_CAPTURE_HEIGHT}`,
  ];
  const failures: string[] = [];
  for (const executable of chromeCandidates(explicitPath)) {
    if (path.isAbsolute(executable) && !existsSync(executable)) continue;
    try {
      return await launchHeadlessBrowser({ executable, args });
    } catch (error) {
      failures.push(
        `${executable}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(`No Chrome executable found. Set CHROME_PATH or pass --chrome.${failures.length ? ` Attempts: ${failures.join(" | ")}` : ""}`);
}

function chromeCandidates(explicitPath?: string) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    path.join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.PROGRAMFILES ?? "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Microsoft/Edge/Application/msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ];
  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))];
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
    throw new Error("CDP target response was malformed");
  }
  return { id: response.id, webSocketDebuggerUrl: response.webSocketDebuggerUrl };
}

async function closeCdpTarget(port: number, id: string) {
  await cdpFetch(port, `/json/close/${encodeURIComponent(id)}`);
}

async function findOpenPort() {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("probe") });
  const port = probe.port;
  probe.stop(true);
  if (!port) throw new Error("Could not allocate a local port");
  return port;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function positiveInteger(value: string | undefined, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}



function recordFrom(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function valueAt(root: unknown, parts: readonly string[]): unknown {
  let value = root;
  for (const part of parts) {
    if (!isRecord(value)) return undefined;
    value = value[part];
  }
  return value;
}

function requiredRecordAt(root: unknown, parts: readonly string[]): UnknownRecord {
  const value = valueAt(root, parts);
  if (!isRecord(value)) throw new Error(`Expected object at ${parts.join(".")}`);
  return value;
}

function requiredNumberAt(root: unknown, parts: readonly string[]): number {
  const value = valueAt(root, parts);
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Expected finite number at ${parts.join(".")}`);
  return value;
}

function nullableFiniteNumberAt(root: unknown, parts: readonly string[]): number | null {
  const value = valueAt(root, parts);
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected finite number or null at ${parts.join(".")}`);
  }
  return value;
}

function requiredBooleanAt(root: unknown, parts: readonly string[]): boolean {
  const value = valueAt(root, parts);
  if (typeof value !== "boolean") throw new Error(`Expected boolean at ${parts.join(".")}`);
  return value;
}

function requiredStringAt(root: unknown, parts: readonly string[]): string {
  const value = valueAt(root, parts);
  if (typeof value !== "string" || value.length === 0) throw new Error(`Expected non-empty string at ${parts.join(".")}`);
  return value;
}

if (import.meta.main) {
  await runBrowserProof(parseBrowserProofOptions(process.argv.slice(2)));
}
