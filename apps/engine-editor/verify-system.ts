import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import puppeteer, { type Browser, type CDPSession, type Page } from "puppeteer-core";

type Evidence = Record<string, unknown>;
type Check = { name: string; evidence: Evidence };

const studioRoot = import.meta.dir;
const engineRoot = resolve(studioRoot, "..", "..", "engine");
const outputRoot = join(engineRoot, ".local", "editor");
const skipBuild = process.argv.includes("--skip-build");

async function main() {
  await mkdir(outputRoot, { recursive: true });
  if (!skipBuild) await run(process.execPath, [join(studioRoot, "build.ts")], "Engine Editor build");

  const port = await openPort();
  let server: ChildProcess | undefined;
  let browser: Browser | undefined;
  try {
    server = spawn(process.execPath, [join(studioRoot, "server.ts")], {
      cwd: engineRoot,
      env: { ...process.env, ENGINE_EDITOR_HOST: "127.0.0.1", ENGINE_EDITOR_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    await waitForServer(`http://127.0.0.1:${port}/healthz`, server);
    browser = await puppeteer.launch({
      executablePath: chromeExecutable(),
      headless: true,
      defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
      args: ["--disable-dev-shm-usage", "--enable-webgl", "--ignore-gpu-blocklist", "--no-first-run"],
    });
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error instanceof Error ? error.message : String(error)));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => Boolean((globalThis as unknown as { __engineStudio?: { ready: boolean } }).__engineStudio?.ready));

    const checks: Check[] = [];
    checks.push(await verifyFirstRunHome(page));
    checks.push(await verifyWorkspaceRetention(page));
    checks.push(await verifyWasmFallback(page));
    checks.push(await verifyKeyboardBlurReset(page, cdp));
    checks.push(await verifyPostProcessOverrun(page));
    checks.push(await verifyDpiResizeDebounce(page, cdp));
    checks.push(await verifyLayoutAndPlayback(page, cdp));
    checks.push(await verifyFiveMinutePongJourney(page));
    checks.push(await verify3DStarterJourney(page));
    checks.push(await verifyOptionalAiChat(page));
    assert(browserErrors.length === 0, `Browser errors:\n${browserErrors.join("\n")}`);

    const screenshot = join(outputRoot, "system-acceptance.png");
    await page.screenshot({ path: screenshot, fullPage: false });
    const report = join(outputRoot, "system-verification.json");
    await writeFile(report, `${JSON.stringify({ passed: true, generatedAt: new Date().toISOString(), checks, screenshot }, null, 2)}\n`);
    for (const check of checks) console.log(`✓ ${check.name}`);
    console.log(`Engine Editor Puppeteer/CDP system verification passed (${checks.length}/${checks.length})`);
    console.log(`Report: ${report}`);
  } finally {
    await browser?.close().catch(() => undefined);
    await stop(server);
  }
}

async function verifyOptionalAiChat(page: Page): Promise<Check> {
  const opened = await page.evaluate(() => {
    const launcher = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "AI");
    launcher?.click();
    return Boolean(launcher);
  });
  assert(opened, "Optional AI chat launcher was not rendered");
  await page.waitForSelector('[data-test-editor-ai-panel=""]');
  const evidence = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-test-editor-ai-panel=""]')!;
    const endpoint = panel.querySelector<HTMLInputElement>('input[aria-label="Harness address"]');
    const composer = panel.querySelector<HTMLTextAreaElement>("textarea");
    return {
      endpoint: endpoint?.value,
      explainsOptionalBackend: panel.textContent?.includes("Connect your local harness to enable AI chat") ?? false,
      composerDisabledOffline: composer?.disabled ?? false
    };
  });
  assert(evidence.endpoint === "http://127.0.0.1:8787", `Unexpected harness default endpoint: ${JSON.stringify(evidence)}`);
  assert(evidence.explainsOptionalBackend && evidence.composerDisabledOffline, `AI chat does not degrade gracefully offline: ${JSON.stringify(evidence)}`);
  await page.click('button[aria-label="Close AI chat"]');
  await page.waitForSelector('[data-test-editor-ai-panel=""]', { hidden: true });
  return { name: "Optional harness-backed AI chat degrades gracefully offline", evidence };
}

async function verifyFirstRunHome(page: Page): Promise<Check> {
  const evidence = await page.evaluate(() => {
    const center = document.querySelector<HTMLElement>("#editor-center")!;
    return {
      visible: !center.hidden && getComputedStyle(center).display !== "none",
      title: center.querySelector("h2")?.textContent?.trim(),
      starters: center.querySelectorAll(".starter-card").length,
      hasPong: Boolean(center.querySelector('[data-template="pong"]')),
      has3D: Boolean(center.querySelector('[data-template="3d-action"]')),
      hasBlank: Boolean(center.querySelector('[data-template="blank-2d"]')),
      hasLearn: Boolean(center.querySelector('[data-center-tab="learn"]')),
    };
  });
  assert(evidence.visible && evidence.title === "What do you want to make?", `First-run project choice is not the primary editor surface: ${JSON.stringify(evidence)}`);
  assert(evidence.starters === 4 && evidence.hasPong && evidence.has3D && evidence.hasBlank && evidence.hasLearn, `First-run choices are incomplete: ${JSON.stringify(evidence)}`);
  const screenshot = join(outputRoot, "ux-first-run.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  return { name: "First-run intent, tutorial, and starter home", evidence: { ...evidence, screenshot } };
}

async function verifyFiveMinutePongJourney(page: Page): Promise<Check> {
  await page.click('[data-editor-action="create-template"][data-template="pong"]');
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem("catalog-engine.editor.recovery.v1") ?? "null");
    return saved?.extensions?.hyperfocusStarter?.template === "pong";
  });
  const initial = await page.evaluate(() => {
    const editor = (globalThis as unknown as { __engineEditor: { entityPosition(id: string): { x: number; y: number } | undefined } }).__engineEditor;
    return {
      entities: document.querySelectorAll("#project-entities [data-project-entity]").length,
      editableFields: document.querySelectorAll("#project-selection-inspector [data-entity-property]").length,
      canvasClient: (() => { const bounds = document.querySelector<HTMLCanvasElement>("#stage-canvas")!.getBoundingClientRect(); return { width: bounds.width, height: bounds.height }; })(),
      ball: editor.entityPosition("ball"),
      player: editor.entityPosition("player-paddle"),
    };
  });
  assert(initial.entities === 5 && initial.editableFields >= 5, `Pong starter is not immediately editable: ${JSON.stringify(initial)}`);
  assert(initial.canvasClient.width >= 500 && initial.canvasClient.height >= 300, `Stage stayed collapsed after a workspace/resize change: ${JSON.stringify(initial.canvasClient)}`);
  await page.click('[data-editor-mode="play"]');
  await delay(180);
  await page.keyboard.down("KeyW");
  await delay(180);
  await page.keyboard.up("KeyW");
  const played = await page.evaluate((before) => {
    const editor = (globalThis as unknown as { __engineEditor: { entityPosition(id: string): { x: number; y: number } | undefined } }).__engineEditor;
    const ball = editor.entityPosition("ball")!;
    const player = editor.entityPosition("player-paddle")!;
    const toast = document.querySelector<HTMLElement>("#editor-toast");
    return { ballMoved: ball.x !== before.ball?.x || ball.y !== before.ball?.y, paddleMovedUp: player.y < (before.player?.y ?? player.y), feedbackVisible: Boolean(toast?.classList.contains("is-visible") && toast.textContent?.includes("Play mode")), ball, player };
  }, initial);
  assert(played.ballMoved && played.paddleMovedUp && played.feedbackVisible, `Pong did not play with visible feedback from the starter: ${JSON.stringify(played)}`);
  const pongVisual = await page.evaluate(({ ball, player }) => {
    const context = document.querySelector<HTMLCanvasElement>("#stage-canvas")!.getContext("2d")!;
    const pixel = (x: number, y: number) => [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data];
    const background = pixel(300, 120);
    const paddle = pixel(player.x, player.y);
    const ballPixel = pixel(ball.x, ball.y);
    return { background, paddle, ball: ballPixel, cleanArena: background[1] < 100, paddleVisible: paddle[1] > 130, ballVisible: ballPixel[0] > 150 && ballPixel[1] > 150 };
  }, { ball: played.ball, player: played.player });
  assert(pongVisual.cleanArena && pongVisual.paddleVisible && pongVisual.ballVisible, `Pong Play view is visually invalid: ${JSON.stringify(pongVisual)}`);
  const pongScreenshot = join(outputRoot, "ux-pong-play.png");
  await page.screenshot({ path: pongScreenshot, fullPage: false });
  await page.click('[data-editor-mode="edit"]');
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept^="image/"]')!;
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ff00aa"/></svg>';
    const transfer = new DataTransfer();
    transfer.items.add(new File([source], "drop-me.svg", { type: "image/svg+xml", lastModified: 1 }));
    Object.defineProperty(input, "files", { configurable: true, value: transfer.files });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll("#project-assets [data-project-asset]").length === 1);
  const assetId = await page.$eval("#project-assets [data-project-asset]", (row) => (row as HTMLElement).dataset.projectAsset!);
  await page.waitForFunction((id) => (globalThis as unknown as { __engineEditor: { assetPreviewReady(id: string): boolean } }).__engineEditor.assetPreviewReady(id), {}, assetId);
  await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>("#project-assets [data-project-asset]")!;
    const stage = document.querySelector<HTMLElement>("#stage-canvas-wrap")!;
    const transfer = new DataTransfer();
    row.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
    const bounds = stage.getBoundingClientRect();
    stage.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer, clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }));
  });
  await page.waitForFunction(() => document.querySelectorAll("#project-entities [data-project-entity]").length === 6);
  await page.$eval('[data-entity-property="x"]', (input) => { (input as HTMLInputElement).value = "300"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.$eval('[data-entity-property="y"]', (input) => { (input as HTMLInputElement).value = "150"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  const assetFlow = await page.evaluate((id) => {
    const saved = JSON.parse(localStorage.getItem("catalog-engine.editor.recovery.v1") ?? "null");
    const entity = saved.scenes[0].entities.find((candidate: { components?: Array<{ values: Record<string, unknown> }> }) => candidate.components?.some((component) => component.values.asset === id));
    const canvas = document.querySelector<HTMLCanvasElement>("#stage-canvas")!;
    const pixel = [...canvas.getContext("2d")!.getImageData(Math.round(entity.x), Math.round(entity.y), 1, 1).data];
    return { assetId: id, entity: { id: entity.id, x: entity.x, y: entity.y }, pixel, visibleInEditor: pixel[0] > 200 && pixel[1] < 80 && pixel[2] > 140 };
  }, assetId);
  assert(assetFlow.visibleInEditor, `Imported image did not render at its dropped Stage position: ${JSON.stringify(assetFlow)}`);
  await page.evaluate(() => (globalThis as unknown as { __engineEditor: { showWorkspace(id: string): void } }).__engineEditor.showWorkspace("script"));
  await page.$eval("#script-editor", (editor) => {
    const textarea = editor as HTMLTextAreaElement;
    textarea.value += "\n// UX journey saved this source";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click('[data-editor-action="save-script"]');
  const codeScreenshot = join(outputRoot, "ux-code-editor.png");
  await page.screenshot({ path: codeScreenshot, fullPage: false });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("catalog-engine.editor.recovery.v1") ?? "null")?.extensions?.hyperfocusScripts?.files?.[0]?.source?.includes("UX journey saved"));
  const sourceSaved = await page.evaluate(() => JSON.parse(localStorage.getItem("catalog-engine.editor.recovery.v1") ?? "null")?.extensions?.hyperfocusScripts?.files?.[0]?.source?.includes("UX journey saved"));
  assert(sourceSaved, "The embedded TypeScript editor did not persist source into project recovery data");
  await page.click('[data-editor-mode="build"]');
  const buildReady = await page.$eval('[data-editor-action="download-build"]', (button) => !(button as HTMLButtonElement).disabled);
  assert(buildReady, "Pong did not reach the one-click offline build happy path");
  return { name: "Five-minute Pong creation, play, asset drop, code, and build journey", evidence: { ...initial, ...played, pongVisual, assetFlow, sourceSaved, buildReady, pongScreenshot, codeScreenshot } };
}

async function verify3DStarterJourney(page: Page): Promise<Check> {
  await page.click('[data-editor-action="close-center"]');
  await page.click('[data-editor-action="new"]');
  await page.click('.starter-card [data-editor-action="create-template"][data-template="3d-action"]');
  await page.waitForFunction(() => document.querySelector("#scene3d-status")?.textContent?.includes("WEBGL2 READY"));
  const initial = await page.evaluate(() => {
    const editor = (globalThis as unknown as { __engineEditor: { scene3dObjectPosition(id: string): { x: number; y: number; z: number } | undefined } }).__engineEditor;
    const canvas = document.querySelector<HTMLCanvasElement>("#scene3d-canvas")!;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return { objects: document.querySelectorAll("#scene3d-entities [data-3d-entity]").length, actor: editor.scene3dObjectPosition("actor"), webgl: Boolean(gl) };
  });
  assert(initial.objects === 5 && initial.webgl && initial.actor, `3D starter did not produce an editable WebGL scene: ${JSON.stringify(initial)}`);
  await page.$eval('[data-3d-field="position.0"]', (input) => { (input as HTMLInputElement).value = "1.5"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  const editedX = await page.evaluate(() => JSON.parse(localStorage.getItem("catalog-engine.editor.recovery.v1") ?? "null")?.extensions?.hyperfocus3D?.scenes?.[0]?.entities?.find((entity: { id: string }) => entity.id === "actor")?.position?.[0]);
  assert(editedX === 1.5, `3D transform edit did not persist: ${String(editedX)}`);
  await page.click('[data-editor-mode="play"]');
  const before = await page.evaluate(() => (globalThis as unknown as { __engineEditor: { scene3dObjectPosition(id: string): { x: number; y: number; z: number } } }).__engineEditor.scene3dObjectPosition("actor"));
  await page.keyboard.down("KeyD");
  await delay(220);
  await page.keyboard.up("KeyD");
  const after = await page.evaluate(() => (globalThis as unknown as { __engineEditor: { scene3dObjectPosition(id: string): { x: number; y: number; z: number } } }).__engineEditor.scene3dObjectPosition("actor"));
  assert(after.x > before.x, `3D Play mode did not move the actor: ${JSON.stringify({ before, after })}`);
  const screenshot = join(outputRoot, "ux-3d-play.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  return { name: "3D starter creation, transform, WebGL, and play journey", evidence: { ...initial, editedX, before, after, screenshot } };
}

async function verifyWorkspaceRetention(page: Page): Promise<Check> {
  const evidence = await page.evaluate(() => {
    const studio = (globalThis as unknown as { __engineStudio: { selectEntity(id: string): void; showWorkspace(id: string): void; selectedEntityId: string; activeWorkspace: string } }).__engineStudio;
    studio.showWorkspace("stage");
    studio.selectEntity("sentinel-a");
    const before = studio.selectedEntityId;
    studio.showWorkspace("post");
    studio.showWorkspace("stage");
    const selectedRow = document.querySelector<HTMLElement>('[data-entity-id="sentinel-a"]');
    return { before, after: studio.selectedEntityId, activeWorkspace: studio.activeWorkspace, rowSelected: selectedRow?.classList.contains("is-selected") ?? false };
  });
  assert(evidence.before === "sentinel-a" && evidence.after === "sentinel-a", "Workspace swap did not retain the selected entity");
  assert(evidence.activeWorkspace === "stage" && evidence.rowSelected, "Stage tree did not restore its selected visual state");
  return { name: "Workspace swapping retains stage state", evidence };
}

async function verifyWasmFallback(page: Page): Promise<Check> {
  const before = await page.evaluate(() => (globalThis as unknown as { __engineStudio: { frameCount: number } }).__engineStudio.frameCount);
  await page.evaluate(async () => {
    const studio = (globalThis as unknown as { __engineStudio: { showWorkspace(id: string): void; simulateWasmFallback(): Promise<void> } }).__engineStudio;
    studio.showWorkspace("diagnostics");
    await studio.simulateWasmFallback();
  });
  await delay(350);
  const evidence = await page.evaluate((startingFrame) => {
    const studio = (globalThis as unknown as { __engineStudio: { frameCount: number; wasmFallbackActive: boolean; wasmFallbackReason: string } }).__engineStudio;
    const pane = document.querySelector<HTMLElement>("#wasm-fallback-diagnostic");
    return {
      fallbackActive: studio.wasmFallbackActive,
      reason: studio.wasmFallbackReason,
      paneVisible: Boolean(pane && !pane.hidden && getComputedStyle(pane).display !== "none"),
      backend: document.querySelector("#diag-backend")?.textContent?.trim(),
      framesAdvanced: studio.frameCount - startingFrame,
    };
  }, before);
  assert(evidence.fallbackActive && evidence.paneVisible, "WASM failure did not activate the scalar fallback diagnostic");
  assert(evidence.reason.includes("MIME type 'application/octet-stream'"), "Fallback pane did not preserve the load fault");
  assert(evidence.backend === "TYPESCRIPT", `Fallback backend is ${evidence.backend ?? "missing"}`);
  assert(evidence.framesAdvanced > 0, "The fixed-step loop stopped after WASM fallback");
  return { name: "WASM fault recovers to scalar TypeScript", evidence };
}

async function verifyKeyboardBlurReset(page: Page, cdp: CDPSession): Promise<Check> {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyA", key: "a" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyD", key: "d" });
  const heldBefore = await keyboardState(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const heldAfter = await keyboardState(page);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyA", key: "a" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyD", key: "d" });
  assert(heldBefore.left && heldBefore.right, "CDP keydown did not reach createKeyboardActions");
  assert(!heldAfter.left && !heldAfter.right, "resetOnBlur did not clear held action state");
  return { name: "Keyboard focus loss clears held actions", evidence: { heldBefore, heldAfter } };
}

async function keyboardState(page: Page) {
  return await page.evaluate(() => {
    const studio = (globalThis as unknown as { __engineStudio: { keyboardHeld(action: string): boolean } }).__engineStudio;
    return { left: studio.keyboardHeld("stage-left"), right: studio.keyboardHeld("stage-right") };
  });
}

async function verifyPostProcessOverrun(page: Page): Promise<Check> {
  const evidence = await page.evaluate(() => {
    const studio = (globalThis as unknown as { __engineStudio: { showWorkspace(id: string): void; appendHeavyPostPasses(count: number): void; postBudgetOk: boolean } }).__engineStudio;
    studio.showWorkspace("post");
    studio.appendHeavyPostPasses(4);
    const component = document.querySelector<HTMLElement>("#budget-component")!;
    const warning = document.querySelector<HTMLElement>("#budget-warning")!;
    return {
      budgetOk: studio.postBudgetOk,
      amberClass: component.classList.contains("has-overrun"),
      warningVisible: !warning.hidden && getComputedStyle(warning).display !== "none",
      warningText: warning.textContent?.trim() ?? "",
      borderColor: getComputedStyle(component).borderColor,
      flameSegments: document.querySelectorAll("#budget-flame i").length,
    };
  });
  assert(!evidence.budgetOk && evidence.amberClass && evidence.warningVisible, "Heavy post stack did not enter its visual overrun state");
  assert(evidence.warningText.includes("allocation exceeded"), "Actionable FX allocation copy is missing");
  assert(evidence.flameSegments >= 4, "Flame graph did not represent the appended passes");
  return { name: "Post-processing overrun is intercepted", evidence };
}

async function verifyDpiResizeDebounce(page: Page, cdp: CDPSession): Promise<Check> {
  const before = await page.evaluate(() => (globalThis as unknown as { __engineStudio: { canvasResizeCommits: number } }).__engineStudio.canvasResizeCommits);
  for (const scale of [2, 1, 2, 1]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 940, deviceScaleFactor: scale, mobile: false });
  }
  await delay(180);
  const evidence = await page.evaluate((startingCommits) => {
    const studio = (globalThis as unknown as { __engineStudio: { canvasResizeCommits: number } }).__engineStudio;
    const canvas = document.querySelector<HTMLCanvasElement>("#stage-canvas")!;
    return { commits: studio.canvasResizeCommits - startingCommits, width: canvas.width, height: canvas.height, contextAlive: Boolean(canvas.getContext("2d")) };
  }, before);
  assert(evidence.commits <= 1, `DPR resize burst committed ${evidence.commits} times instead of at most once`);
  assert(evidence.contextAlive && evidence.width > 0 && evidence.height > 0, "Canvas context was lost during DPR changes");
  return { name: "High-DPI resize bursts are debounced", evidence };
}

async function verifyLayoutAndPlayback(page: Page, cdp: CDPSession): Promise<Check> {
  const tabs = await page.$$eval("[data-workspace-tab]", (nodes) => nodes.length);
  assert(tabs === 8, `Expected eight workspace tabs, found ${tabs}`);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-editor-action="toggle-sidebar"]')?.click());
  const collapsed = await page.evaluate(() => ({
    hidden: document.querySelector<HTMLElement>('[data-solid-state="project-browser"]')?.hidden,
    columns: document.querySelector<HTMLElement>('[data-test-workbench-shell]')?.style.gridTemplateColumns,
  }));
  assert(collapsed.hidden === true && collapsed.columns?.startsWith("minmax"), `Solid workbench did not collapse the project browser: ${JSON.stringify(collapsed)}`);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-editor-action="toggle-sidebar"]')?.click());
  const expanded = await page.evaluate(() => ({
    hidden: document.querySelector<HTMLElement>('[data-solid-state="project-browser"]')?.hidden,
    tabs: document.querySelectorAll("[data-workspace-tab]").length,
    columns: document.querySelector<HTMLElement>('[data-test-workbench-shell]')?.style.gridTemplateColumns,
  }));
  assert(expanded.hidden === false && expanded.tabs === 8 && expanded.columns?.includes("px"), `Solid workbench did not restore its sized sidebar: ${JSON.stringify(expanded)}`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code: "Digit7", key: "7", modifiers: 2 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code: "Digit7", key: "7", modifiers: 2 });
  const playback = await page.evaluate(() => {
    const studio = (globalThis as unknown as { __engineStudio: { activeWorkspace: string } }).__engineStudio;
    return { tabs: document.querySelectorAll("[data-workspace-tab]").length, activeWorkspace: studio.activeWorkspace, motionVisible: !document.querySelector<HTMLElement>("#workspace-motion")!.hidden };
  });
  assert(playback.activeWorkspace === "motion" && playback.motionVisible, "Ctrl+7 did not reveal the persistent Motion workspace");
  return { name: "Workspace layout and global hotkeys", evidence: { ...playback, collapsed, expanded } };
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.PROGRAMFILES ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const executable = candidates.find(existsSync);
  if (!executable) throw new Error("Chrome or Edge was not found. Set CHROME_PATH to an installed Chromium executable.");
  return executable;
}

async function run(command: string, args: string[], label: string) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: engineRoot, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${label} failed with exit code ${code}`)));
  });
}

async function waitForServer(url: string, child: ChildProcess) {
  const started = performance.now();
  while (performance.now() - started < 15_000) {
    if (child.exitCode !== null) throw new Error(`Engine Editor server exited with code ${child.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch { /* startup */ }
    await delay(80);
  }
  throw new Error("Engine Editor server did not become ready");
}

async function openPort() {
  return await new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePromise(port));
    });
  });
}

async function stop(child: ChildProcess | undefined) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else child.kill("SIGTERM");
  await delay(80);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

await main();
