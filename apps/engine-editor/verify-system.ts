import { inspectWorkspaceContrast } from "./utils/workspace-contrast";
import { assert } from "./utils/verify-system-values";
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
    page.on("pageerror", (error) => browserErrors.push(error instanceof Error ? error.stack ?? error.message : String(error)));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(globalThis.__engineStudio?.ready));

    const checks: Check[] = [];
    checks.push(await verifyFirstRunHome(page));
    checks.push(await verifyPreferencesAndContextualTour(page));
    checks.push(await verifyWorkspaceRetention(page));
    checks.push(await verifyWasmFallback(page));
    checks.push(await verifyKeyboardBlurReset(page, cdp));
    checks.push(await verifyPostProcessOverrun(page));
    checks.push(await verifyDpiResizeDebounce(page, cdp));
    checks.push(await verifyLayoutAndPlayback(page, cdp));
    checks.push(await verifyFiveMinutePongJourney(page));
    checks.push(await verify3DStarterJourney(page));
    checks.push(await verifyDomFreeCommandHandoff(page));
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

async function verifyDomFreeCommandHandoff(page: Page): Promise<Check> {
  const handoff = await page.evaluate(async () => {
    const commands = globalThis.__hyperfocusEditorCommands;
    if (!commands) throw new Error("Editor command session is unavailable.");
    return await commands.execute({
      requestId: "system-command-handoff",
      intent: "Verify a validated DOM-free editor change and explicit JSON handoff",
      commands: [{
        type: "project.patch",
        label: "Verify DOM-free command handoff",
        operations: [{ op: "replace", path: "/name", value: "Command Handoff Verification" }],
      }],
    });
  });
  assert(handoff.schema === "hyperfocus-editor-command-handoff-v1" && handoff.ok && handoff.completedCommands === 1, `DOM-free command did not return a successful explicit handoff: ${JSON.stringify(handoff)}`);
  assert(handoff.snapshot?.project?.name === "Command Handoff Verification" && handoff.snapshot?.dirty === true, `DOM-free handoff did not contain the canonical changed snapshot: ${JSON.stringify(handoff)}`);
  return { name: "DOM-free editor command returns an explicit canonical JSON handoff", evidence: { handoff } };
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
      explainsOptionalBackend: (panel.textContent?.includes("Connect your local harness") && panel.textContent.includes("usable offline")) ?? false,
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
    const starterSelect = center.querySelector<HTMLSelectElement>('[aria-label="Starter template"]');
    const starterValues = Array.from(starterSelect?.options ?? [], (option) => option.value);
    return {
      visible: !center.hidden && getComputedStyle(center).display !== "none",
      title: center.querySelector("h2")?.textContent?.trim(),
      starterValues,
      selectedStarter: starterSelect?.value,
      previewAction: center.querySelector('[data-editor-action="create-template"]')?.getAttribute("data-template"),
      hasLearn: Boolean(center.querySelector('[data-editor-center-tab="learn"]')),
    };
  });
  assert(evidence.visible && evidence.title === "What do you want to make?", `First-run project choice is not the primary editor surface: ${JSON.stringify(evidence)}`);
  assert(
    ["pong", "platformer", "3d-action", "blank-2d", "showcase"].every((starter) => evidence.starterValues.includes(starter))
      && evidence.selectedStarter === "pong"
      && evidence.previewAction === "pong"
      && evidence.hasLearn,
    `First-run choices are incomplete: ${JSON.stringify(evidence)}`,
  );
  const screenshot = join(outputRoot, "ux-first-run.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  return { name: "First-run intent, tutorial, and starter home", evidence: { ...evidence, screenshot } };
}

async function verifyPreferencesAndContextualTour(page: Page): Promise<Check> {
  await page.click('[data-editor-center-tab="learn"]');
  await page.click('[data-editor-action="start-guided-tour"]');
  await page.waitForSelector('[data-hf-coachmark=""]');
  const firstStep = await page.evaluate(() => ({
    title: document.querySelector('[data-hf-coachmark] h2')?.textContent?.trim(),
    highlighted: Boolean(document.querySelector('[data-hf-coachmark-target="true"]')),
    progress: document.querySelector('[data-hf-coachmark] header span')?.textContent?.trim(),
  }));
  assert(firstStep.highlighted && firstStep.progress === "Step 1 of 4", `Contextual tour did not anchor its first step: ${JSON.stringify(firstStep)}`);
  const tourScreenshot = join(outputRoot, "ux-contextual-tour.png");
  await page.screenshot({ path: tourScreenshot, fullPage: false });

  await page.click('[data-hf-coachmark] footer button:last-child');
  await page.waitForFunction(() => document.querySelector('[data-hf-coachmark] h2')?.textContent?.includes("Stage"));
  const blockedBeforeInteraction = await page.$eval('[data-hf-coachmark] footer button:last-child', (button) => button instanceof HTMLButtonElement && button.disabled);
  assert(blockedBeforeInteraction, "Tour advanced without the required highlighted interaction");
  await page.click('[data-workspace-tab="stage"]');
  await page.waitForFunction(() => !(document.querySelector<HTMLButtonElement>('[data-hf-coachmark] footer button:last-child')?.disabled ?? true));
  await page.click('[data-hf-coachmark] header button');
  await page.waitForSelector('[data-hf-coachmark=""]', { hidden: true });

  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-editor-action="settings"]')?.click());
  await page.waitForSelector('[data-test-preferences-surface=""]');
  const preferences = await page.evaluate(() => ({
    rows: document.querySelectorAll("[data-preference-id]").length,
    shared: document.body.textContent?.includes("Hyperfocus") ?? false,
    app: document.body.textContent?.includes("This app") ?? false,
    project: document.body.textContent?.includes("Project") ?? false,
    searchable: Boolean(document.querySelector('input[type="search"][placeholder="Search preferences"]')),
    projectFields: Boolean(document.querySelector('[data-preference-id="project.name"]')),
    sections: [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Preference sections"] button')].map((button) => button.textContent?.trim()),
  }));
  assert(preferences.rows >= 5 && preferences.shared && preferences.searchable, `Shared preferences surface is incomplete: ${JSON.stringify(preferences)}`);
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[data-preference-id="shared.theme"] button')].find((button) => button.textContent?.trim() === "Light")?.click());
  await page.waitForFunction(() => document.documentElement.dataset.hfTheme === "light");
  const lightAppearance = await page.$eval('[data-test-preferences-surface=""]', (surface) => {
    const style = getComputedStyle(surface);
    return { background: style.backgroundColor, color: style.color };
  });
  assert(lightAppearance.background !== lightAppearance.color, `Light preference preview lost surface contrast: ${JSON.stringify(lightAppearance)}`);
  const lightScreenshot = join(outputRoot, "ux-light-preferences.png");
  await page.focus('input[type="search"][placeholder="Search preferences"]');
  await page.mouse.move(1590, 990);
  await delay(350);
  await page.screenshot({ path: lightScreenshot, fullPage: false });
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[data-preference-id="shared.theme"] button')].find((button) => button.textContent?.trim() === "Dark")?.click());
  await page.waitForFunction(() => document.documentElement.dataset.hfTheme === "dark");
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Preference sections"] button')[1]?.click());
  await delay(80);
  const editorSectionVisible = await page.evaluate(() => ({
    row: Boolean(document.querySelector('[data-preference-id="editor.sidebarSize"]')),
    active: [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Preference sections"] button')].find((button) => button.getAttribute("aria-current") === "page")?.textContent?.trim(),
    search: document.querySelector<HTMLInputElement>('input[type="search"][placeholder="Search preferences"]')?.value,
    buttons: [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Preference sections"] button')].map((button) => ({ text: button.textContent?.trim(), current: button.getAttribute("aria-current") })),
  }));
  assert(editorSectionVisible.row, `Editor preference section did not render: ${JSON.stringify({ editorSectionVisible, preferences })}`);
  const appScope = await page.$eval('[data-preference-id="editor.sidebarSize"]', (row) => row.textContent?.includes("This app") ?? false);
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Preference sections"] button')[2]?.click());
  await delay(80);
  const projectSectionVisible = await page.evaluate(() => Boolean(document.querySelector('[data-preference-id="project.name"]')));
  assert(projectSectionVisible, "Project preference section did not render");
  const projectScope = await page.$eval('[data-preference-id="project.name"]', (row) => row.textContent?.includes("Project") ?? false);
  const scopedPreferences = { appScope, projectScope };
  assert(scopedPreferences.appScope && scopedPreferences.projectScope, `Preference scopes are not explicit: ${JSON.stringify(scopedPreferences)}`);
  const preferencesScreenshot = join(outputRoot, "ux-scoped-preferences.png");
  await page.focus('input[type="search"][placeholder="Search preferences"]');
  await page.mouse.move(1590, 990);
  await delay(350);
  await page.screenshot({ path: preferencesScreenshot, fullPage: false });
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Preference sections"] button')[0]?.click());
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[data-preference-id="shared.theme"] button')].find((button) => button.textContent?.trim() === "Light")?.click());
  await page.waitForFunction(() => document.documentElement.dataset.hfTheme === "light");
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[data-test-preferences-surface] button')].find((button) => button.textContent?.trim() === "Save settings")?.click());
  await delay(150);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-editor-action="close-center"]')?.click());
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.mouse.move(1590, 990);
  await delay(120);
  const lightWorkspaceAppearance = await page.evaluate(inspectWorkspaceContrast);
  assert(lightWorkspaceAppearance.brandContrast >= 4.5 && lightWorkspaceAppearance.modeContrast >= 4.5, `Light theme loses contrast on dark workspace chrome: ${JSON.stringify(lightWorkspaceAppearance)}`);
  const lightWorkspaceScreenshot = join(outputRoot, "ux-light-workspace.png");
  await page.screenshot({ path: lightWorkspaceScreenshot, fullPage: false });

  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-editor-action="settings"]')?.click());
  await page.waitForSelector('[data-test-preferences-surface=""]');
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[data-preference-id="shared.theme"] button')].find((button) => button.textContent?.trim() === "Dark")?.click());
  await page.waitForFunction(() => document.documentElement.dataset.hfTheme === "dark");
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[data-test-preferences-surface] button')].find((button) => button.textContent?.trim() === "Save settings")?.click());
  await delay(150);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-editor-action="new"]')?.click());
  await page.waitForFunction(() => !document.querySelector<HTMLElement>("#editor-center")?.hidden && document.querySelector('[data-template="pong"]'));
  return { name: "Contextual onboarding and scoped preferences", evidence: { firstStep, preferences, scopedPreferences, lightAppearance, lightWorkspaceAppearance, tourScreenshot, preferencesScreenshot, lightScreenshot, lightWorkspaceScreenshot } };
}

async function verifyFiveMinutePongJourney(page: Page): Promise<Check> {
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-editor-action="new"]')?.click());
  await page.waitForSelector('[data-editor-action="create-template"][data-template="pong"]');
  await page.click('[data-editor-action="create-template"][data-template="pong"]');
  await page.waitForFunction(() => document.querySelectorAll("#project-entities [data-project-entity]").length === 7, { timeout: 10_000 }).catch(() => undefined);
  await delay(250);
  const creation = await page.evaluate(() => ({
    entities: document.querySelectorAll("#project-entities [data-project-entity]").length,
    savedStarter: JSON.parse(localStorage.getItem("catalog-engine.editor.recovery.v1") ?? "null")?.extensions?.hyperfocusStarter?.template,
    centerHidden: document.querySelector<HTMLElement>("#editor-center")?.hidden,
    toast: document.querySelector("#editor-toast")?.textContent?.trim(),
  }));
  assert(creation.entities === 7 && creation.savedStarter === "pong" && creation.centerHidden === true, `Pong starter did not become visible and durable: ${JSON.stringify(creation)}`);
  const starterOpened = await page.evaluate(() => ({
    stageHidden: document.querySelector<HTMLElement>("#workspace-stage")?.hidden,
    centerHidden: document.querySelector<HTMLElement>("#editor-center")?.hidden,
    activeWorkspace: globalThis.__engineStudio?.activeWorkspace,
    toast: document.querySelector("#editor-toast")?.textContent,
    console: document.querySelector("#editor-console-output")?.textContent?.slice(0, 500),
  }));
  assert(starterOpened.stageHidden === false, `Pong starter did not reveal the Stage: ${JSON.stringify(starterOpened)}`);
  const initial = await page.evaluate(() => {
    const editor = globalThis.__engineEditor;
    if (!editor) throw new Error("Editor automation is unavailable.");
    return {
      entities: document.querySelectorAll("#project-entities [data-project-entity]").length,
      editableFields: document.querySelectorAll("#project-selection-inspector [data-entity-property]").length,
      canvasClient: (() => { const bounds = document.querySelector<HTMLCanvasElement>("#stage-canvas")!.getBoundingClientRect(); return { width: bounds.width, height: bounds.height }; })(),
      canvasHost: (() => {
        const host = document.querySelector<HTMLElement>("#stage-canvas-wrap")!;
        const panel = host.closest<HTMLElement>(".viewport-panel")!;
        return { host: host.getBoundingClientRect().toJSON(), panel: panel.getBoundingClientRect().toJSON() };
      })(),
      layout: (() => {
        const workspace = document.querySelector<HTMLElement>("#workspace-stage")!;
        const host = document.querySelector<HTMLElement>(".workspace-host")!;
        const shell = document.querySelector<HTMLElement>("[data-test-workbench-shell]")!;
        const stage = document.querySelector<HTMLElement>(".stage-layout")!;
        return {
          workspaceHidden: workspace.hidden,
          workspaceDisplay: getComputedStyle(workspace).display,
          host: host.getBoundingClientRect().toJSON(),
          shell: shell.getBoundingClientRect().toJSON(),
          stage: stage.getBoundingClientRect().toJSON(),
          stageColumns: stage.style.gridTemplateColumns,
          panelHidden: [...stage.querySelectorAll<HTMLElement>(":scope > [data-workspace-panel]")].map((panel) => panel.hidden),
        };
      })(),
      ball: editor.entityPosition("ball"),
      player: editor.entityPosition("player-paddle"),
    };
  });
  const remainingWorkbenchHeight = initial.layout.shell.height - initial.layout.host.height;
  assert(remainingWorkbenchHeight >= 0 && remainingWorkbenchHeight <= 24.5, `Runtime workspace leaves space beyond the collapsed console rail: ${JSON.stringify(initial.layout)}`);
  assert(initial.entities === 7 && initial.editableFields >= 5, `Pong starter is not immediately editable: ${JSON.stringify(initial)}`);
  assert(initial.canvasClient.width >= 500 && initial.canvasClient.height >= 300, `Stage stayed collapsed after a workspace/resize change: ${JSON.stringify({ canvas: initial.canvasClient, canvasHost: initial.canvasHost, layout: initial.layout })}`);
  await page.click('[data-editor-mode="play"]');
  await delay(180);
  await page.keyboard.down("KeyW");
  await delay(180);
  await page.keyboard.up("KeyW");
  const played = await page.evaluate((before) => {
    const editor = globalThis.__engineEditor;
    if (!editor) throw new Error("Editor automation is unavailable.");
    const ball = editor.entityPosition("ball")!;
    const player = editor.entityPosition("player-paddle")!;
    const toast = document.querySelector<HTMLElement>("#editor-toast");
    return { ballMoved: ball.x !== before.ball?.x || ball.y !== before.ball?.y, paddleMovedUp: player.y < (before.player?.y ?? player.y), feedbackVisible: Boolean(toast?.classList.contains("is-visible") && toast.textContent?.includes("Play mode")), ball, player };
  }, initial);
  assert(played.ballMoved && played.paddleMovedUp && played.feedbackVisible, `Pong did not play with visible feedback from the starter: ${JSON.stringify(played)}`);
  const pongVisual = await page.evaluate(() => {
    const editor = globalThis.__engineEditor;
    if (!editor) throw new Error("Editor automation is unavailable.");
    const context = document.querySelector<HTMLCanvasElement>("#stage-canvas")!.getContext("2d")!;
    const pixel = (x: number, y: number) => [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data];
    const brightPixelNear = (x: number, y: number, radius: number) => {
      const data = context.getImageData(Math.max(0, Math.round(x - radius)), Math.max(0, Math.round(y - radius)), radius * 2 + 1, radius * 2 + 1).data;
      for (let index = 0; index < data.length; index += 4) if (data[index] > 150 && data[index + 1] > 150) return true;
      return false;
    };
    const ball = editor.entityPosition("ball");
    const player = editor.entityPosition("player-paddle");
    if (!ball || !player) throw new Error("Pong entities are unavailable for visual verification.");
    const background = pixel(300, 120);
    const paddle = pixel(player.x, player.y);
    const ballPixel = pixel(ball.x, ball.y);
    return { background, paddle, ball: ballPixel, cleanArena: background[1] < 100, paddleVisible: paddle[1] > 130, ballVisible: brightPixelNear(ball.x, ball.y, 18) };
  });
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
  const assetId = await page.$eval("#project-assets [data-project-asset]", (row) => {
    if (!(row instanceof HTMLElement) || !row.dataset.projectAsset) throw new Error("Imported asset row has no project asset ID.");
    return row.dataset.projectAsset;
  });
  await page.waitForFunction((id) => globalThis.__engineEditor?.assetPreviewReady(id) ?? false, {}, assetId);
  await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>("#project-assets [data-project-asset]")!;
    const stage = document.querySelector<HTMLElement>("#stage-canvas-wrap")!;
    const transfer = new DataTransfer();
    row.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
    const bounds = stage.getBoundingClientRect();
    stage.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer, clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }));
  });
  await page.waitForFunction(() => document.querySelectorAll("#project-entities [data-project-entity]").length === 8);
  await page.$eval('[data-entity-property="x"]', (input) => { if (!(input instanceof HTMLInputElement)) throw new Error("Entity x input is unavailable."); input.value = "300"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.$eval('[data-entity-property="y"]', (input) => { if (!(input instanceof HTMLInputElement)) throw new Error("Entity y input is unavailable."); input.value = "150"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  const assetFlow = await page.evaluate((id) => {
    const saved = JSON.parse(localStorage.getItem("catalog-engine.editor.recovery.v1") ?? "null");
    const entity = saved.scenes[0].entities.find((candidate: { components?: Array<{ values: Record<string, unknown> }> }) => candidate.components?.some((component) => component.values.asset === id));
    const canvas = document.querySelector<HTMLCanvasElement>("#stage-canvas")!;
    const pixel = [...canvas.getContext("2d")!.getImageData(Math.round(entity.x), Math.round(entity.y), 1, 1).data];
    return { assetId: id, entity: { id: entity.id, x: entity.x, y: entity.y }, pixel, visibleInEditor: pixel[0] > 120 && pixel[1] < 100 && pixel[2] > 100 };
  }, assetId);
  assert(assetFlow.visibleInEditor, `Imported image did not render at its dropped Stage position: ${JSON.stringify(assetFlow)}`);
  await page.evaluate(() => globalThis.__engineEditor?.showWorkspace("script"));
  await page.$eval("#script-editor", (editor) => {
    if (!(editor instanceof HTMLTextAreaElement)) throw new Error("Script editor is unavailable.");
    const textarea = editor;
    textarea.value = `import type { PlayableBehavior2D } from "@hyperfocus/engine/project/runtime-2d";

// UX journey saved and executes this source in editor Play.
export const addJuice: PlayableBehavior2D = ({ actions }) => ({
  velocityY: actions.includes("move-up") ? -420 : 0,
});`;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click('[data-editor-action="save-script"]');
  await delay(500);
  const sourcePersistence = await page.evaluate(() => ({
    saved: JSON.parse(localStorage.getItem("catalog-engine.editor.recovery.v1") ?? "null")?.extensions?.hyperfocusScripts?.files?.[0]?.source?.includes("UX journey saved") ?? false,
    editorStatus: document.querySelector("#script-editor-status")?.textContent?.trim(),
    textareaHasSource: document.querySelector<HTMLTextAreaElement>("#script-editor")?.value.includes("UX journey saved") ?? false,
    toast: document.querySelector("#editor-toast")?.textContent?.trim(),
  }));
  assert(sourcePersistence.saved && sourcePersistence.textareaHasSource, `Code source did not flush into durable project recovery: ${JSON.stringify(sourcePersistence)}`);
  await page.click('[data-project-entity="player-paddle"]');
  await page.$eval('[data-component-key="module"]', (input) => { if (!(input instanceof HTMLInputElement)) throw new Error("Behavior module input is unavailable."); input.value = "./src/gameplay.ts"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.$eval('[data-component-key="export"]', (input) => { if (!(input instanceof HTMLInputElement)) throw new Error("Behavior export input is unavailable."); input.value = "addJuice"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.evaluate(() => globalThis.__engineEditor?.showWorkspace("script"));
  await page.click('[data-editor-action="toggle-live-source"]');
  await page.waitForFunction(() => document.querySelector("#script-live-status")?.textContent?.includes("READY"));
  const sourceSaved = await page.evaluate(() => ({
    saved: JSON.parse(localStorage.getItem("catalog-engine.editor.recovery.v1") ?? "null")?.extensions?.hyperfocusScripts?.files?.[0]?.source?.includes("UX journey saved"),
    permission: document.querySelector('[data-editor-action="toggle-live-source"]')?.getAttribute("aria-pressed"),
    status: document.querySelector("#script-live-status")?.textContent?.trim(),
  }));
  const codeScreenshot = join(outputRoot, "ux-code-editor.png");
  await page.screenshot({ path: codeScreenshot, fullPage: false });
  assert(sourceSaved.saved && sourceSaved.permission === "true" && sourceSaved.status?.includes("READY"), `The embedded TypeScript editor did not save and compile permitted source: ${JSON.stringify(sourceSaved)}`);
  const customBefore = await page.evaluate(() => globalThis.__engineEditor?.entityPosition("player-paddle"));
  await page.click('[data-editor-mode="play"]');
  await delay(100);
  await page.keyboard.down("KeyW");
  await delay(180);
  await page.keyboard.up("KeyW");
  const customAfter = await page.evaluate(() => globalThis.__engineEditor?.entityPosition("player-paddle"));
  assert(customBefore && customAfter && customAfter.y < customBefore.y, `Permitted custom behavior did not execute in editor Play: ${JSON.stringify({ customBefore, customAfter })}`);
  await page.click('[data-editor-mode="edit"]');
  await page.click('[data-project-entity="player-paddle"]');
  await page.$eval('[data-component-key="module"]', (input) => { if (!(input instanceof HTMLInputElement)) throw new Error("Behavior module input is unavailable."); input.value = "builtin:pong-paddle"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.$eval('[data-component-key="export"]', (input) => { if (!(input instanceof HTMLInputElement)) throw new Error("Behavior export input is unavailable."); input.value = "update"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.click('[data-editor-mode="build"]');
  const buildReady = await page.$eval('[data-editor-action="download-build"]', (button) => button instanceof HTMLButtonElement && !button.disabled);
  assert(buildReady, "Pong did not reach the one-click offline build happy path");
  return { name: "Five-minute Pong creation, play, asset drop, live code, and build journey", evidence: { creation, ...initial, ...played, pongVisual, assetFlow, sourcePersistence, sourceSaved, customBefore, customAfter, buildReady, pongScreenshot, codeScreenshot } };
}

async function verify3DStarterJourney(page: Page): Promise<Check> {
  await page.click('[data-editor-action="close-center"]');
  await page.click('[data-editor-action="new"]');
  await page.$eval('[aria-label="Starter template"]', (select) => {
    if (!(select instanceof HTMLSelectElement)) throw new Error("Starter selector is unavailable.");
    const option = [...select.options].find((candidate) => candidate.value === "3d-action");
    if (!option) throw new Error("3D starter option is unavailable.");
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, option.value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await delay(150);
  const starterTransition = await page.evaluate(() => ({
    centerHidden: document.querySelector<HTMLElement>("#editor-center")?.hidden,
    selectedValue: document.querySelector<HTMLSelectElement>('[aria-label="Starter template"]')?.value,
    previewTemplate: document.querySelector('[data-editor-action="create-template"]')?.getAttribute("data-template"),
    previewText: document.querySelector('[data-editor-action="create-template"]')?.textContent?.trim(),
  }));
  assert(starterTransition.centerHidden === false && starterTransition.selectedValue === "3d-action" && starterTransition.previewTemplate === "3d-action", `3D starter selection did not update its preview: ${JSON.stringify(starterTransition)}`);
  await page.$eval('[data-editor-action="create-template"][data-template="3d-action"]', (button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error("3D starter action is unavailable.");
    button.click();
  });
  await page.waitForFunction(() => document.querySelector("#scene3d-status")?.textContent?.includes("WEBGL2 READY"));
  const initial = await page.evaluate(() => {
    const editor = globalThis.__engineEditor;
    if (!editor) throw new Error("Editor automation is unavailable.");
    const canvas = document.querySelector<HTMLCanvasElement>("#scene3d-canvas")!;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return { objects: document.querySelectorAll("#scene3d-entities [data-3d-entity]").length, actor: editor.scene3dObjectPosition("actor"), webgl: Boolean(gl) };
  });
  assert(initial.objects === 5 && initial.webgl && initial.actor, `3D starter did not produce an editable WebGL scene: ${JSON.stringify(initial)}`);
  await page.$eval('[data-3d-field="position.0"]', (input) => { if (!(input instanceof HTMLInputElement)) throw new Error("3D position input is unavailable."); input.value = "1.5"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  const editedX = await page.evaluate(() => JSON.parse(localStorage.getItem("catalog-engine.editor.recovery.v1") ?? "null")?.extensions?.hyperfocus3D?.scenes?.[0]?.entities?.find((entity: { id: string }) => entity.id === "actor")?.position?.[0]);
  assert(editedX === 1.5, `3D transform edit did not persist: ${String(editedX)}`);
  await page.click('[data-editor-mode="play"]');
  await page.waitForFunction(() => document.querySelector("#scene3d-status")?.textContent?.includes("REAL RUNTIME"));
  const before = await page.evaluate(() => globalThis.__engineEditor?.scene3dObjectPosition("actor"));
  await page.keyboard.down("KeyD");
  await delay(220);
  await page.keyboard.up("KeyD");
  const after = await page.evaluate(() => globalThis.__engineEditor?.scene3dObjectPosition("actor"));
  assert(before && after && after.x > before.x, `3D Play mode did not move the actor: ${JSON.stringify({ before, after })}`);
  const screenshot = join(outputRoot, "ux-3d-play.png");
  await page.screenshot({ path: screenshot, fullPage: false });
  await page.click('[data-editor-mode="edit"]');
  await page.waitForFunction(() => document.querySelector("#scene3d-status")?.textContent?.includes("WEBGL2 READY"));
  await page.click('[data-editor-mode="play"]');
  await page.waitForFunction(() => document.querySelector("#scene3d-status")?.textContent?.includes("REAL RUNTIME"));
  const restarted = await page.evaluate(() => ({
    status: document.querySelector("#scene3d-status")?.textContent?.trim(),
    actor: globalThis.__engineEditor?.scene3dObjectPosition("actor"),
  }));
  assert(restarted.actor?.x === editedX, `3D Play did not restart from the authored snapshot: ${JSON.stringify(restarted)}`);
  await page.click('[data-editor-mode="edit"]');
  return { name: "3D starter creation, transform, WebGL, input, and repeatable Play lifecycle", evidence: { ...initial, editedX, before, after, restarted, screenshot } };
}

async function verifyWorkspaceRetention(page: Page): Promise<Check> {
  const evidence = await page.evaluate(() => {
    const studio = globalThis.__engineStudio;
    if (!studio) throw new Error("Editor automation is unavailable.");
    studio.showWorkspace("stage");
    studio.selectEntity("sentinel-a");
    const before = studio.selectedEntityId;
    studio.showWorkspace("post");
    studio.showWorkspace("stage");
    const selectedRow = document.querySelector<HTMLElement>('[data-project-entity="sentinel-a"]');
    return {
      before,
      after: studio.selectedEntityId,
      activeWorkspace: studio.activeWorkspace,
      rowSelected: selectedRow?.classList.contains("is-active") && selectedRow.getAttribute("aria-selected") === "true",
    };
  });
  assert(evidence.before === "sentinel-a" && evidence.after === "sentinel-a", "Workspace swap did not retain the selected entity");
  assert(evidence.activeWorkspace === "stage" && evidence.rowSelected, "Stage tree did not restore its selected visual state");
  return { name: "Workspace swapping retains stage state", evidence };
}

async function verifyWasmFallback(page: Page): Promise<Check> {
  const before = await page.evaluate(() => globalThis.__engineStudio?.frameCount ?? 0);
  await page.evaluate(async () => {
    const studio = globalThis.__engineStudio;
    if (!studio) throw new Error("Editor automation is unavailable.");
    studio.showWorkspace("diagnostics");
    await studio.simulateWasmFallback();
  });
  await delay(350);
  const evidence = await page.evaluate((startingFrame) => {
    const studio = globalThis.__engineStudio;
    if (!studio) throw new Error("Editor automation is unavailable.");
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
    const studio = globalThis.__engineStudio;
    if (!studio) throw new Error("Editor automation is unavailable.");
    return { left: studio.keyboardHeld("stage-left"), right: studio.keyboardHeld("stage-right") };
  });
}

async function verifyPostProcessOverrun(page: Page): Promise<Check> {
  const evidence = await page.evaluate(() => {
    const studio = globalThis.__engineStudio;
    if (!studio) throw new Error("Editor automation is unavailable.");
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
  const before = await page.evaluate(() => globalThis.__engineStudio?.canvasResizeCommits ?? 0);
  for (const scale of [2, 1, 2, 1]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 940, deviceScaleFactor: scale, mobile: false });
  }
  await delay(180);
  const evidence = await page.evaluate((startingCommits) => {
    const studio = globalThis.__engineStudio;
    if (!studio) throw new Error("Editor automation is unavailable.");
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
    persisted: Boolean(JSON.parse(localStorage.getItem("hyperfocus.editor.ui-preferences.v2") ?? "null")?.app?.workbench?.sidebarCollapsed),
  }));
  assert(collapsed.hidden === true && collapsed.columns?.startsWith("0px 24px") && collapsed.persisted, `Solid workbench did not collapse and persist the project browser: ${JSON.stringify(collapsed)}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(globalThis.__engineStudio?.ready));
  const restored = await page.evaluate(() => ({
    hidden: document.querySelector<HTMLElement>('[data-solid-state="project-browser"]')?.hidden,
    columns: document.querySelector<HTMLElement>('[data-test-workbench-shell]')?.style.gridTemplateColumns,
  }));
  assert(restored.hidden === true && restored.columns?.startsWith("0px 24px"), `Solid workbench did not restore the collapsed project browser after reload: ${JSON.stringify(restored)}`);
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
    const studio = globalThis.__engineStudio;
    if (!studio) throw new Error("Editor automation is unavailable.");
    const handles = [...document.querySelectorAll<HTMLElement>(".sequence-shell [role='separator']")];
    handles[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const tracksHiddenAfterCollapse = document.querySelector<HTMLElement>(".sequence-tracks-panel")?.hidden;
    handles[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    return {
      tabs: document.querySelectorAll("[data-workspace-tab]").length,
      activeWorkspace: studio.activeWorkspace,
      motionVisible: !document.querySelector<HTMLElement>("#workspace-motion")!.hidden,
      motionHandles: handles.length,
      bottomOrientation: handles[2]?.getAttribute("aria-orientation"),
      tracksHiddenAfterCollapse,
      motionPersisted: Boolean(JSON.parse(localStorage.getItem("hyperfocus.editor.ui-preferences.v2") ?? "null")?.app?.workspaces?.motion),
      transportNames: [...document.querySelectorAll<HTMLButtonElement>(".sequence-transport button")].map((button) => button.getAttribute("aria-label")),
      timelineRegion: document.querySelector("#sequence-canvas")?.getAttribute("aria-label"),
    };
  });
  assert(playback.activeWorkspace === "motion" && playback.motionVisible, "Ctrl+7 did not reveal the persistent Motion workspace");
  assert(playback.motionHandles === 3 && playback.bottomOrientation === "horizontal" && playback.tracksHiddenAfterCollapse && playback.motionPersisted, `Motion panels do not satisfy the resize/collapse contract: ${JSON.stringify(playback)}`);
  assert(playback.transportNames.length === 5 && playback.transportNames.every(Boolean) && playback.timelineRegion === "Timeline keyframes and events", `Sequence controls do not expose nonvisual names: ${JSON.stringify(playback)}`);
  return { name: "Durable workspace layout and global hotkeys", evidence: { ...playback, collapsed, restored, expanded } };
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



function delay(milliseconds: number) {
  return new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

await main();
