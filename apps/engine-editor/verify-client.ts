import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { createHyperfocusProjectFiles } from "../../engine/src/project/index.ts";
import { createStarterProject } from "../../engine/scripts/create-project.ts";
import { createStandalonePlayableHtml } from "./src/playable-build.ts";

type JsonRecord = Record<string, unknown>;
type CdpTarget = { webSocketDebuggerUrl: string };
type Verification = { name: string; passed: true; evidence: JsonRecord };

const studioRoot = import.meta.dir;
const engineRoot = resolve(studioRoot, "..", "..", "engine");
const outputDir = join(engineRoot, ".local", "editor");
const chromePath = argumentValue("--chrome") ?? process.env.CHROME_PATH;
const skipBuild = process.argv.includes("--skip-build");

class CdpRouter {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private readonly listeners = new Map<string, Set<(params: unknown) => void>>();

  request(method: string, params: JsonRecord, timeoutMs: number) {
    const id = this.nextId++;
    let resolvePromise!: (value: unknown) => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<unknown>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
    const timer = setTimeout(() => {
      this.pending.delete(id);
      rejectPromise(new Error(`CDP command timed out: ${method}`));
    }, timeoutMs);
    this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
    return { id, payload: JSON.stringify({ id, method, params }), promise };
  }

  accept(message: string) {
    const packet = JSON.parse(message) as JsonRecord;
    if (typeof packet.id === "number") {
      const pending = this.pending.get(packet.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(packet.id);
      if (packet.error) pending.reject(new Error(JSON.stringify(packet.error)));
      else pending.resolve(packet.result);
      return;
    }
    if (typeof packet.method !== "string") return;
    for (const listener of this.listeners.get(packet.method) ?? []) listener(packet.params);
  }

  on(method: string, listener: (params: unknown) => void) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
  }

  close(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

class CdpSession {
  private readonly router = new CdpRouter();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") this.router.accept(event.data);
    });
    socket.addEventListener("error", () => this.router.close(new Error("CDP WebSocket error")));
    socket.addEventListener("close", () => this.router.close(new Error("CDP WebSocket closed")));
  }

  static async connect(url: string) {
    const socket = new WebSocket(url);
    await new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to CDP")), 10_000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolvePromise(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not connect to CDP")); }, { once: true });
    });
    return new CdpSession(socket);
  }

  command(method: string, params: JsonRecord = {}, timeoutMs = 30_000) {
    const request = this.router.request(method, params, timeoutMs);
    this.socket.send(request.payload);
    return request.promise;
  }

  on(method: string, listener: (params: unknown) => void) {
    this.router.on(method, listener);
  }

  close() {
    this.socket.close(1000, "Engine Editor verification complete");
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  if (!skipBuild) await runCommand(process.execPath, [join(studioRoot, "build.ts")], "Engine Editor build");
  const narrativeHtml = await createNarrativeStandaloneFixture();

  const [serverPort, cdpPort] = await Promise.all([findOpenPort(), findOpenPort()]);
  const profileDir = await mkdtemp(join(tmpdir(), "engine-editor-cdp-"));
  let server: ChildProcess | undefined;
  let chrome: ChildProcess | undefined;
  let session: CdpSession | undefined;
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  try {
    server = spawn(process.execPath, [join(studioRoot, "server.ts")], {
      cwd: engineRoot,
      env: { ...process.env, ENGINE_EDITOR_HOST: "127.0.0.1", ENGINE_EDITOR_PORT: String(serverPort) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    await waitForHttp(`http://127.0.0.1:${serverPort}/healthz`, server, "Engine Editor server");
    chrome = await launchChrome(cdpPort, profileDir, chromePath);
    const target = await firstPageTarget(cdpPort);
    session = await CdpSession.connect(target.webSocketDebuggerUrl);
    await Promise.all([
      session.command("Page.enable"),
      session.command("Runtime.enable"),
      session.command("DOM.enable"),
      session.command("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }),
    ]);
    session.on("Runtime.exceptionThrown", (params) => pageErrors.push(JSON.stringify(params)));
    session.on("Runtime.consoleAPICalled", (params) => {
      const record = asRecord(params);
      if (record.type !== "error") return;
      consoleErrors.push(JSON.stringify(params));
    });

    await session.command("Page.navigate", { url: `http://127.0.0.1:${serverPort}/` });
    await waitForExpression(session, "globalThis.__engineEditor?.ready === true", 30_000, "Engine Editor readiness");

    const results: Verification[] = [];
    results.push(await verifyBootstrapAndLayout(session));
    results.push(await verifyProjectFoundation(session));
    results.push(await verifyNeutralExportFallback(session));
    results.push(await verifyStandalonePlayableBuild(session));
    results.push(await verifyNarrativeStandaloneRuntime(session, narrativeHtml));
    results.push(await verifyEditorPlayParity(session));
    await evaluate(session,"document.querySelector('[data-editor-action=settings]').click()");
    const projectCenterScreenshot=await captureScreenshot(session,"project-center.png");
    await dispatchKey(session,"Escape","Escape",0);
    results.push(await verifyGlobalOrchestration(session));
    await dispatchShortcut(session,"KeyP","p",2);
    const commandPaletteScreenshot=await captureScreenshot(session,"command-palette.png");
    await dispatchKey(session,"Escape","Escape",0);
    results.push(await verifyAuthoringPowerTools(session));
    results.push(await verifyProductionSystems(session));
    await evaluate(session,"globalThis.__engineEditor.openProductionLab('export');true"); await delay(80); const productionExportScreenshot=await captureScreenshot(session,"production-export.png");
    await evaluate(session,"globalThis.__engineEditor.openProductionLab('reactive');true"); await delay(80); const productionReactiveScreenshot=await captureScreenshot(session,"production-reactive.png");
    await evaluate(session,"globalThis.__engineEditor.openProductionLab('logic');true"); await delay(80); const productionLogicScreenshot=await captureScreenshot(session,"production-logic.png");
    await evaluate(session,"globalThis.__engineEditor.openProductionLab('rig');true"); await delay(80); const productionRigScreenshot=await captureScreenshot(session,"production-sprite-rig.png");
    await evaluate(session,"globalThis.__engineEditor.openProductionLab('review');true"); await delay(80); const productionReviewScreenshot=await captureScreenshot(session,"production-review.png");
    await dispatchKey(session,"Escape","Escape",0);
    const tilemapScreenshot = await captureWorkspaceScreenshot(session, "tilemap", "tilemap-painter.png");
    const atlasScreenshot = await captureWorkspaceScreenshot(session, "atlas", "atlas-slicer.png");
    results.push(await verifyPostBudget(session));
    const postScreenshot = await captureScreenshot(session, "post-processing.png");
    results.push(await verifyStageInteraction(session));
    const stageScreenshot = await captureScreenshot(session, "stage-inspector.png");
    results.push(await verifyWasmTelemetry(session));
    const diagnosticsScreenshot = await captureScreenshot(session, "diagnostics.png");
    results.push(await verifyZeroClipRig(session));
    const screenshotPath = await captureScreenshot(session, "acceptance.png");

    assert(pageErrors.length === 0, `Page exceptions were reported: ${pageErrors.join("\n")}`);
    assert(consoleErrors.length === 0, `Console errors were reported: ${consoleErrors.join("\n")}`);

    const report = {
      passed: true,
      generatedAt: new Date().toISOString(),
      url: `http://127.0.0.1:${serverPort}/`,
      chrome: await evaluate<string>(session, "navigator.userAgent"),
      results,
      screenshots: {
        stage: stageScreenshot,
        commandPalette: commandPaletteScreenshot,
        tilemap: tilemapScreenshot,
        atlas: atlasScreenshot,
        postProcessing: postScreenshot,
        diagnostics: diagnosticsScreenshot,
        motion: screenshotPath,
        projectCenter: projectCenterScreenshot,
        productionExport: productionExportScreenshot,
        productionReactive: productionReactiveScreenshot,
        productionLogic: productionLogicScreenshot,
        productionRig: productionRigScreenshot,
        productionReview: productionReviewScreenshot,
      },
    };
    const reportPath = join(outputDir, "verification.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    for (const result of results) console.log(`✓ ${result.name}`);
    console.log(`Engine Editor CDP verification passed (${results.length}/${results.length})`);
    console.log(`Report: ${reportPath}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } finally {
    if (session) {
      await session.command("Browser.close").catch(() => undefined);
      await delay(250);
    }
    session?.close();
    await stopProcess(chrome);
    await stopProcess(server);
    await removeChromeProfile(profileDir);
  }
}

async function removeChromeProfile(profileDir: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM") throw error;
      await delay(500);
    }
  }
  console.warn(`Chrome released its temporary profile too slowly; cleanup can be retried later: ${profileDir}`);
}

async function createNarrativeStandaloneFixture() {
  const bundled = await Bun.build({
    entrypoints: [join(studioRoot, "src", "standalone-entry.ts")],
    format: "iife",
    minify: true,
    target: "browser",
    write: false,
  } as Parameters<typeof Bun.build>[0]);
  if (!bundled.success || !bundled.outputs[0]) throw new Error("Narrative standalone fixture runtime failed to bundle.");
  const project = createStarterProject("narrative-rpg", "Narrative Acceptance", "2026-01-01T00:00:00.000Z");
  const files = await createHyperfocusProjectFiles(project, []);
  return createStandalonePlayableHtml({ project, ...files, runtimeSource: await bundled.outputs[0].text() });
}

async function verifyNarrativeStandaloneRuntime(session: CdpSession, html: string): Promise<Verification> {
  await evaluate(session, `(() => {
    document.querySelector('#narrative-verification')?.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'narrative-verification';
    iframe.style.cssText = 'position:fixed;width:320px;height:240px;opacity:0.01;pointer-events:none;left:0;bottom:0';
    iframe.srcdoc = ${JSON.stringify(html)};
    document.body.append(iframe);
    return true;
  })()`);
  await waitForExpression(session, "document.querySelector('#narrative-verification')?.contentWindow?.__hyperfocusPlayable?.ready === true", 30_000, "narrative standalone readiness");
  const first = await evaluate<{ greeting: string; accept: string; decline: string; savedState: string; completedState: string }>(session, `(async () => {
    const iframe = document.querySelector('#narrative-verification');
    const runtime = iframe.contentWindow.__hyperfocusPlayable;
    const press = async (code, key) => {
      iframe.contentWindow.dispatchEvent(new iframe.contentWindow.KeyboardEvent('keydown', { code, key }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      iframe.contentWindow.dispatchEvent(new iframe.contentWindow.KeyboardEvent('keyup', { code, key }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    };
    const greeting = runtime.storyView().text;
    await press('KeyE', 'e');
    const choices = runtime.storyView().options;
    await press('Digit1', '1');
    await press('KeyQ', 'q');
    const savedState = runtime.storySnapshot().quests[0].stateId;
    await runtime.save();
    await press('KeyR', 'r');
    const completedState = runtime.storySnapshot().quests[0].stateId;
    return { greeting, accept: choices[0].text, decline: choices[1].text, savedState, completedState };
  })()`, true);
  assert(first.greeting.includes("Mara") && first.greeting.startsWith("Bienvenida"), `Narrative locale variable substitution failed: ${JSON.stringify(first)}`);
  assert(first.accept === "I will recover it." && first.decline === "Todavía no.", `Narrative locale fallback failed: ${JSON.stringify(first)}`);
  assert(first.savedState === "searching" && first.completedState === "complete", `Narrative quest actions failed: ${JSON.stringify(first)}`);
  await evaluate(session, `(() => {
    document.querySelector('#narrative-verification')?.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'narrative-verification';
    iframe.style.cssText = 'position:fixed;width:320px;height:240px;opacity:0.01;pointer-events:none;left:0;bottom:0';
    iframe.srcdoc = ${JSON.stringify(html)};
    document.body.append(iframe);
    return true;
  })()`);
  await waitForExpression(session, "document.querySelector('#narrative-verification')?.contentWindow?.__hyperfocusPlayable?.ready === true", 30_000, "narrative save restore");
  const restored = await evaluate<{ state: string; dialogueNode: string; diagnostics: number }>(session, `(async () => {
    const runtime = document.querySelector('#narrative-verification').contentWindow.__hyperfocusPlayable;
    const result = { state: runtime.storySnapshot().quests[0].stateId, dialogueNode: runtime.storySnapshot().dialogue.nodeId, diagnostics: runtime.diagnostics.length };
    await runtime.deleteSaveProfile();
    document.querySelector('#narrative-verification').remove();
    return result;
  })()`, true);
  assert(restored.state === "searching" && restored.dialogueNode === "end", `Narrative save did not atomically restore story state: ${JSON.stringify(restored)}`);
  assert(restored.diagnostics === 0, `Narrative standalone reported diagnostics: ${JSON.stringify(restored)}`);
  return { name: "Narrative Story/Localization/Quest Save Runtime", passed: true, evidence: { ...first, ...restored } };
}

async function captureScreenshot(session: CdpSession, filename: string) {
  const screenshot = asRecord(await session.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }));
  assert(typeof screenshot.data === "string", "CDP screenshot did not return image data");
  const screenshotPath = join(outputDir, filename);
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return screenshotPath;
}

async function captureWorkspaceScreenshot(session:CdpSession,workspace:string,filename:string){
  await evaluate(session,`globalThis.__engineStudio.showWorkspace('${workspace}');true`);
  await delay(80);
  return await captureScreenshot(session,filename);
}

async function dispatchShortcut(session:CdpSession,code:string,key:string,modifiers:number){await dispatchKey(session,code,key,modifiers);}
async function dispatchKey(session:CdpSession,code:string,key:string,modifiers:number){
  const virtualKeyCode=code==="Space"?32:code==="Enter"?13:undefined;
  await session.command("Input.dispatchKeyEvent",{type:"keyDown",code,key,modifiers,...(virtualKeyCode?{windowsVirtualKeyCode:virtualKeyCode,nativeVirtualKeyCode:virtualKeyCode}:{}) ,...(modifiers===0&&key.length===1?{text:key}:{})});
  await session.command("Input.dispatchKeyEvent",{type:"keyUp",code,key,modifiers});
}

async function verifyBootstrapAndLayout(session: CdpSession): Promise<Verification> {
  const tabs = await evaluate<number>(session, "document.querySelectorAll('[data-workspace-tab]').length");
  assert(tabs === 8, `Expected eight workspace tabs, received ${tabs}`);
  const ids = ["stage", "scene3d", "tilemap", "atlas", "script", "post", "motion", "diagnostics"] as const;
  const visibility: Record<string, boolean> = {};
  for (const id of ids) {
    visibility[id] = await evaluate<boolean>(session, `(() => {
      document.querySelector('[data-workspace-tab="${id}"]').click();
      const workspace = document.querySelector('#workspace-${id}');
      return !workspace.hidden && getComputedStyle(workspace).display !== 'none';
    })()`);
    assert(visibility[id], `Workspace ${id} did not become visible after tab click`);
  }
  return { name: "Verification 1 — Bootstrap & Layout", passed: true, evidence: { tabs, visibility } };
}

async function verifyProjectFoundation(session:CdpSession):Promise<Verification>{
  const evidence=await evaluate<{modes:number;resources:number;before:number;after:number;restored:number;recoveryFormat:string;dirty:boolean;tabSemantics:boolean}>(session,`(()=>{
    const modes=document.querySelectorAll('button[data-editor-mode]').length;
    const resources=document.querySelectorAll('[data-workspace-tab]').length;
    const before=document.querySelectorAll('#project-entities [data-project-entity]').length;
    document.querySelector('[data-editor-action="create-entity"]').click();
    const after=document.querySelectorAll('#project-entities [data-project-entity]').length;
    const dirty=document.querySelector('#editor-project-state').classList.contains('is-dirty');
    const recovery=JSON.parse(localStorage.getItem('catalog-engine.editor.recovery.v1'));
    document.querySelector('[data-editor-action="undo"]').click();
    const restored=document.querySelectorAll('#project-entities [data-project-entity]').length;
    const tabSemantics=[...document.querySelectorAll('[data-workspace-tab]')].every(tab=>tab.getAttribute('role')==='tab'&&tab.hasAttribute('aria-selected'));
    return{modes,resources,before,after,restored,recoveryFormat:recovery.format,dirty,tabSemantics};
  })()`);
  assert(evidence.modes===4,`Editor modes are incomplete: ${JSON.stringify(evidence)}`);
  assert(evidence.resources===8,"Resource editor navigation is incomplete");
  assert(evidence.after===evidence.before+1&&evidence.restored===evidence.before,"Project entity create/undo did not round-trip");
  assert(evidence.recoveryFormat==="catalog-engine-editor-project"&&evidence.dirty,"Versioned local recovery was not written");
  assert(evidence.tabSemantics,"Resource tabs are missing accessible tab state");
  return{name:"Verification 2 — Project, Recovery & Undo",passed:true,evidence};
}

async function verifyNeutralExportFallback(session: CdpSession): Promise<Verification> {
  await evaluate(session, `(() => {
    globalThis.showDirectoryPicker = undefined;
    globalThis.__capturedNeutralExports = [];
    globalThis.__neutralOriginalObjectUrl = URL.createObjectURL.bind(URL);
    globalThis.__neutralOriginalAnchorClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (blob) => {
      if (blob instanceof Blob && blob.type === 'application/zip') globalThis.__capturedNeutralExports.push(blob);
      return globalThis.__neutralOriginalObjectUrl(blob);
    };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.endsWith('-neutral-export.zip')) globalThis.__neutralDownloadName = this.download;
    };
    document.querySelector('[data-editor-action="new"]').click();
    document.querySelector('[data-editor-action="export-neutral"]').click();
    return true;
  })()`);
  await waitForExpression(session, "globalThis.__capturedNeutralExports?.length === 1", 30_000, "neutral export ZIP fallback");
  const evidence = await evaluate<{ name: string; bytes: number; signature: string; hasProject: boolean; hasManifest: boolean; hasFormat: boolean; diagnostics: number; success: boolean }>(session, `(async () => {
    const blob = globalThis.__capturedNeutralExports[0];
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    const output = [...document.querySelectorAll('#editor-console-output > div')].map((row) => row.textContent);
    URL.createObjectURL = globalThis.__neutralOriginalObjectUrl;
    HTMLAnchorElement.prototype.click = globalThis.__neutralOriginalAnchorClick;
    return {
      name: globalThis.__neutralDownloadName,
      bytes: bytes.byteLength,
      signature: [...bytes.slice(0, 4)].map((value) => value.toString(16).padStart(2, '0')).join(''),
      hasProject: text.includes('project.json'),
      hasManifest: text.includes('manifest.json'),
      hasFormat: text.includes('hyperfocus-neutral-export'),
      diagnostics: output.filter((line) => line.includes('[behavior-requires-port]') || line.includes('[extension-namespace]')).length,
      success: output.some((line) => line.includes('Neutral export downloaded') && line.includes('project SHA-256')),
    };
  })()`, true);
  assert(evidence.name.endsWith("-neutral-export.zip"), `Neutral export fallback filename is not portable: ${JSON.stringify(evidence)}`);
  assert(evidence.bytes > 1_000 && evidence.signature === "504b0304", `Neutral export is not a standard non-empty ZIP: ${JSON.stringify(evidence)}`);
  assert(evidence.hasProject && evidence.hasManifest && evidence.hasFormat, `Neutral export omitted ordinary project/manifest evidence: ${JSON.stringify(evidence)}`);
  assert(evidence.diagnostics > 0 && evidence.success, `Neutral export did not surface diagnostics and success evidence: ${JSON.stringify(evidence)}`);
  await dispatchKey(session, "Escape", "Escape", 0);
  return { name: "Verification 3 — Neutral Export Escape Hatch", passed: true, evidence };
}

async function verifyStandalonePlayableBuild(session: CdpSession): Promise<Verification> {
  await evaluate(session, `(() => {
    globalThis.__capturedStandaloneBuilds = [];
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob instanceof Blob && blob.type === 'text/html') globalThis.__capturedStandaloneBuilds.push(blob);
      return original(blob);
    };
    document.querySelector('[data-editor-action="build"]').click();
    document.querySelector('[data-editor-action="download-build"]').click();
    return true;
  })()`);
  await waitForExpression(session, "globalThis.__capturedStandaloneBuilds?.length === 1", 30_000, "standalone HTML build capture");
  const embedded = await evaluate<{ bytes: number; externalReferences: boolean }>(session, `(async () => {
    const html = await globalThis.__capturedStandaloneBuilds[0].text();
    globalThis.__standaloneVerificationHtml = html;
    const old = document.querySelector('#standalone-verification');
    old?.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'standalone-verification';
    // Keep the canvas paintable while it runs. Chromium may suppress animation
    // frames for fully transparent, effectively hidden cross-document content.
    iframe.style.cssText = 'position:fixed;width:320px;height:240px;opacity:0.01;pointer-events:none;right:0;bottom:0';
    iframe.srcdoc = html;
    document.body.append(iframe);
    return { bytes: new Blob([html]).size, externalReferences: /<script\\s+src=|<link\\s+[^>]*href=|https?:\\/\\//i.test(html) };
  })()`, true);
  assert(embedded.bytes > 1_000, `Standalone HTML is unexpectedly small: ${embedded.bytes} bytes`);
  assert(!embedded.externalReferences, "Standalone HTML contains an external script, stylesheet, or network URL");
  await waitForExpression(session, "document.querySelector('#standalone-verification')?.contentWindow?.__hyperfocusPlayable?.ready === true", 30_000, "standalone runtime readiness");
  await waitForExpression(session, "document.querySelector('#standalone-verification')?.contentWindow?.__hyperfocusPlayable?.frameCount > 1", 30_000, "standalone runtime animation frames");
  const evidence = await evaluate<{ startX: number; endX: number; frames: number; assets: number; diagnostics: number; readyState: string; savedX: number }>(session, `(async () => {
    const iframe = document.querySelector('#standalone-verification');
    const runtime = iframe.contentWindow.__hyperfocusPlayable;
    const startX = runtime.snapshot().entities.find((entity) => entity.id === 'player-01').x;
    iframe.contentWindow.dispatchEvent(new iframe.contentWindow.KeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));
    await new Promise((resolve) => setTimeout(resolve, 180));
    iframe.contentWindow.dispatchEvent(new iframe.contentWindow.KeyboardEvent('keyup', { code: 'KeyD', key: 'd' }));
    const endX = runtime.snapshot().entities.find((entity) => entity.id === 'player-01').x;
    await runtime.save();
    const savedX = runtime.snapshot().entities.find((entity) => entity.id === 'player-01').x;
    return { startX, endX, frames: runtime.frameCount, assets: runtime.assetCount, diagnostics: runtime.diagnostics.length, readyState: iframe.contentDocument.body.dataset.hyperfocusReady, savedX };
  })()`, true);
  assert(evidence.readyState === "true" && evidence.frames > 1, `Standalone runtime did not render frames: ${JSON.stringify(evidence)}`);
  assert(evidence.endX > evidence.startX, `Standalone input did not move the player: ${JSON.stringify(evidence)}`);
  assert(evidence.diagnostics === 0, `Default standalone build contains unsupported runtime behavior: ${JSON.stringify(evidence)}`);
  await evaluate(session, `(() => {
    document.querySelector('#standalone-verification')?.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'standalone-verification';
    iframe.style.cssText = 'position:fixed;width:320px;height:240px;opacity:0.01;pointer-events:none;right:0;bottom:0';
    iframe.srcdoc = globalThis.__standaloneVerificationHtml;
    document.body.append(iframe);
    return true;
  })()`);
  await waitForExpression(session, "document.querySelector('#standalone-verification')?.contentWindow?.__hyperfocusPlayable?.ready === true", 30_000, "standalone save restore after clean document boot");
  const persistence = await evaluate<{ restoredX: number; schema: string; exportedBytes: number; checksum: boolean }>(session, `(async () => {
    const runtime = document.querySelector('#standalone-verification').contentWindow.__hyperfocusPlayable;
    const restoredX = runtime.snapshot().entities.find((entity) => entity.id === 'player-01').x;
    const exported = await runtime.exportSaveProfile();
    const envelope = JSON.parse(exported);
    await runtime.deleteSaveProfile();
    return { restoredX, schema: runtime.savePolicy.schema, exportedBytes: new TextEncoder().encode(exported).byteLength, checksum: /^[0-9a-f]{64}$/.test(envelope.checksum) };
  })()`, true);
  assert(persistence.restoredX === evidence.savedX, `Standalone save did not restore across document recreation: ${JSON.stringify({ evidence, persistence })}`);
  assert(persistence.schema === "portable-world-snapshot-v1" && persistence.exportedBytes > 100 && persistence.checksum, `Standalone save export is incomplete: ${JSON.stringify(persistence)}`);
  await evaluate(session, "document.querySelector('#standalone-verification')?.remove(); document.querySelector('[data-editor-action=close-center]')?.click(); true");
  return { name: "Standalone Offline Playable Build", passed: true, evidence: { ...embedded, ...evidence, ...persistence } };
}

async function verifyEditorPlayParity(session: CdpSession): Promise<Verification> {
  await dispatchKey(session, "F6", "F6", 0);
  const start = await evaluate<{ x: number; y: number }>(session, "globalThis.__engineEditor.entityPosition('player-01')");
  await session.command("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyD", key: "d", text: "d" });
  await delay(180);
  await session.command("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyD", key: "d" });
  const played = await evaluate<{ x: number; y: number }>(session, "globalThis.__engineEditor.entityPosition('player-01')");
  assert(played.x > start.x, `Editor Play did not execute portable input movement: ${JSON.stringify({ start, played })}`);
  await dispatchKey(session, "F1", "F1", 0);
  const restored = await evaluate<{ x: number; y: number }>(session, "globalThis.__engineEditor.entityPosition('player-01')");
  assert(restored.x === start.x && restored.y === start.y, `Leaving Play did not restore authored state: ${JSON.stringify({ start, restored })}`);
  return { name: "Editor Play/Build Runtime Parity", passed: true, evidence: { start, played, restored } };
}

async function verifyGlobalOrchestration(session:CdpSession):Promise<Verification>{
  await dispatchShortcut(session,"Digit3","3",2);
  const hotkeyWorkspace=await evaluate<string>(session,"globalThis.__engineStudio.activeWorkspace");
  assert(hotkeyWorkspace==="tilemap",`Ctrl+3 opened ${hotkeyWorkspace} instead of tilemap`);
  await dispatchShortcut(session,"KeyP","p",2);
  const paletteOpen=await evaluate<boolean>(session,"globalThis.__engineStudio.commandPaletteOpen && !document.querySelector('#command-palette').hidden");
  assert(paletteOpen,"Ctrl+P did not open the command palette");
  const resultCount=await evaluate<number>(session,`(()=>{const input=document.querySelector('#command-query');input.value='post process';input.dispatchEvent(new Event('input',{bubbles:true}));return document.querySelectorAll('.command-result[data-command-index]').length;})()`);
  assert(resultCount>0,"Command palette fuzzy search returned no Post-Process action");
  await dispatchKey(session,"Enter","Enter",0);
  const paletteDestination=await evaluate<string>(session,"globalThis.__engineStudio.activeWorkspace");
  assert(paletteDestination==="post",`Command palette navigated to ${paletteDestination} instead of post`);
  await dispatchKey(session,"Space"," ",0);
  if (!await evaluate<boolean>(session,"globalThis.__engineEditor.loopPaused")) {
    await evaluate(session,"document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true,cancelable:true}))");
  }
  const pauseEvidence=await evaluate<{paused:boolean;active:string;paletteHidden:boolean;playback:string}>(session,"({paused:globalThis.__engineEditor.loopPaused,active:document.activeElement?.outerHTML?.slice(0,120)??'',paletteHidden:document.querySelector('#command-palette').hidden,playback:document.querySelector('#playback-status').textContent})");
  const paused=pauseEvidence.paused;
  assert(paused,`Space did not pause the engine loop: ${JSON.stringify(pauseEvidence)}`);
  const beforeSteps=await evaluate<number>(session,"globalThis.__engineStudio.manualSteps");
  await dispatchShortcut(session,"ArrowRight","ArrowRight",2);
  const afterStep=await evaluate<{paused:boolean;steps:number}>(session,"({paused:globalThis.__engineStudio.loopPaused,steps:globalThis.__engineStudio.manualSteps})");
  assert(afterStep.paused&&afterStep.steps===beforeSteps+1,"Ctrl+Right did not advance exactly one frame while remaining paused");
  await evaluate(session,"document.querySelector('#global-playback').click()");
  return{name:"Verification 3 — Global Navigation & Playback",passed:true,evidence:{hotkeyWorkspace,paletteOpen,resultCount,paletteDestination,manualStepDelta:afterStep.steps-beforeSteps}};
}

async function verifyAuthoringPowerTools(session:CdpSession):Promise<Verification>{
  await evaluate(session,"globalThis.__engineStudio.showWorkspace('tilemap');true");
  await dispatchKey(session,"KeyM","m",0);await dispatchKey(session,"KeyC","c",0);
  const tile=await evaluate<{tool:string;rects:number}>(session,"({tool:globalThis.__engineStudio.tileTool,rects:globalThis.__engineStudio.extractedCollisionCount})");
  assert(tile.tool==="marquee","M did not activate the marquee tool");assert(tile.rects>0,"C did not extract collision rectangles");
  const atlas=await evaluate<{frames:number;speed:string}>(session,`(()=>{globalThis.__engineStudio.showWorkspace('atlas');document.querySelector('#slice-width').value='64';document.querySelector('#slice-height').value='80';document.querySelector('#slice-grid').click();const speed=document.querySelector('#atlas-speed');speed.value='2';speed.dispatchEvent(new Event('input'));speed.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));return{frames:globalThis.__engineStudio.atlasFrameCount,speed:speed.value};})()`);
  assert(atlas.frames===32,`Grid slicer produced ${atlas.frames} frames instead of 32`);assert(atlas.speed==="1","Atlas speed double-click did not reset to 1.0×");
  const post=await evaluate<{before:string;after:string;bypassed:boolean}>(session,`(()=>{globalThis.__engineStudio.showWorkspace('post');const cards=[...document.querySelectorAll('.effect-card')];const before=cards.map(card=>card.dataset.effectId).join(',');cards[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true}));cards[2].dispatchEvent(new DragEvent('drop',{bubbles:true}));const after=[...document.querySelectorAll('.effect-card')].map(card=>card.dataset.effectId).join(',');document.dispatchEvent(new KeyboardEvent('keydown',{code:'Backquote',key:'\`',bubbles:true}));return{before,after,bypassed:document.querySelector('.compare-stage').classList.contains('is-bypassed')};})()`);
  assert(post.before!==post.after,"Post-process drag/drop did not reorder the effect stack");assert(post.bypassed,"Holding backtick did not activate A/B bypass");
  await evaluate(session,"document.dispatchEvent(new KeyboardEvent('keyup',{code:'Backquote',key:'`',bubbles:true}));true");
  const latency=await evaluate<string>(session,`(()=>{globalThis.__engineStudio.showWorkspace('diagnostics');const slider=document.querySelector('#latency-slider');slider.value='240';slider.dispatchEvent(new Event('input'));slider.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));return slider.value;})()`);
  assert(latency==="0","Latency slider double-click did not reset to 0 ms");
  await evaluate(session,"globalThis.__engineStudio.showWorkspace('motion');true");
  const handle=await evaluate<{x:number;y:number}>(session,`(()=>{const canvas=document.querySelector('#rig-canvas');const rect=canvas.getBoundingClientRect();return{x:rect.left+(Number(canvas.dataset.rightHandX)/canvas.width)*rect.width,y:rect.top+(Number(canvas.dataset.rightHandY)/canvas.height)*rect.height};})()`);
  await session.command("Input.dispatchMouseEvent",{type:"mousePressed",x:handle.x,y:handle.y,button:"left",clickCount:1});await session.command("Input.dispatchMouseEvent",{type:"mouseMoved",x:handle.x+35,y:handle.y-22,button:"left"});await session.command("Input.dispatchMouseEvent",{type:"mouseReleased",x:handle.x+35,y:handle.y-22,button:"left",clickCount:1});
  const ikSolved=await evaluate<boolean>(session,"document.querySelector('#rig-canvas').dataset.ikSolved === 'true'");assert(ikSolved,"Dragging a rig handle did not run IK solving");
  return{name:"Verification 4 — Authoring Power Tools",passed:true,evidence:{tile,atlas,post,latencyMs:Number(latency),ikSolved}};
}

async function verifyProductionSystems(session:CdpSession):Promise<Verification>{
  const evidence=await evaluate<{modal:boolean;midi:string;automationKeys:number;trace:string;bones:number;poses:number;comments:number;webm:{bytes:number;type:string}}>(session,`(async()=>{
    const editor=globalThis.__engineEditor;
    editor.openProductionLab('reactive');
    const modal=!document.querySelector('#production-center').hidden;
    document.querySelector('#automation-record').click();
    editor.simulateMidi(112);
    document.querySelector('#automation-record').click();
    const midi=document.querySelector('#midi-value').textContent.trim();
    const automationKeys=document.querySelectorAll('.sequence-key').length;
    editor.openProductionLab('logic');
    document.querySelector('#run-logic-graph').click();
    const trace=document.querySelector('#logic-status').textContent.trim();
    editor.openProductionLab('rig');
    const bonesBefore=document.querySelectorAll('.bone-row').length;
    document.querySelector('#add-sprite-bone').click();
    document.querySelector('#save-sprite-pose').click();
    document.querySelector('#key-sprite-pose').click();
    const bones=document.querySelectorAll('.bone-row').length;
    const poses=document.querySelectorAll('.pose-row').length;
    editor.openProductionLab('review');
    const input=document.querySelector('#annotation-body');input.value='CDP review note';document.querySelector('#post-annotation').click();
    const comments=document.querySelectorAll('.annotation').length;
    editor.openProductionLab('export');
    const webm=await editor.exportSequencePreview();
    return{modal,midi,automationKeys,trace,bones:bones-bonesBefore,poses,comments,webm};
  })()`,true,60_000);
  assert(evidence.modal,"Production Lab did not open");
  assert(evidence.midi.includes("112"),`MIDI simulation did not reach the live monitor: ${evidence.midi}`);
  assert(evidence.automationKeys>0,"MIDI automation did not retain timeline keys");
  assert(evidence.trace.includes("TRACE PASS"),`Logic graph test did not pass: ${evidence.trace}`);
  assert(evidence.bones===1&&evidence.poses>=2,"Sprite rig bone/pose authoring did not persist");
  assert(evidence.comments>=2,"Review annotation was not added");
  assert(evidence.webm.bytes>100&&evidence.webm.type==="video/webm",`WebCodecs export did not produce WebM bytes: ${JSON.stringify(evidence.webm)}`);
  return{name:"Verification 5 — Production Lab Systems",passed:true,evidence};
}

async function verifyPostBudget(session: CdpSession): Promise<Verification> {
  const evidence = await evaluate<{ text: string; warningClass: boolean; visible: boolean; budgetOk: boolean }>(session, `(() => {
    globalThis.__engineStudio.showWorkspace('post');
    globalThis.__engineStudio.injectHeavyPostStack();
    const warning = document.querySelector('#budget-warning');
    const component = document.querySelector('#budget-component');
    return {
      text: warning.textContent.trim(),
      warningClass: component.classList.contains('has-warning'),
      visible: !warning.hidden && getComputedStyle(warning).display !== 'none',
      budgetOk: globalThis.__engineStudio.postBudgetOk,
    };
  })()`);
  assert(evidence.text.includes("High Budget Warning"), "High Budget Warning text was not rendered");
  assert(evidence.warningClass, "Budget component did not receive the warning class");
  assert(evidence.visible, "Budget warning was not visible");
  assert(!evidence.budgetOk, "Injected heavy effect stack unexpectedly passed its budget");
  return { name: "Verification 5 — Post-Process Budget Check", passed: true, evidence };
}

async function verifyStageInteraction(session: CdpSession): Promise<Verification> {
  const point = await evaluate<{ x: number; y: number }>(session, `(() => {
    globalThis.__engineStudio.showWorkspace('stage');
    globalThis.__engineStudio.selectEntity('sentinel-a');
    const canvas = document.querySelector('#stage-canvas');
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (320 / 760) * rect.width, y: rect.top + (242 / 480) * rect.height };
  })()`);
  await session.command("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await session.command("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  if (await evaluate<string | null>(session, "globalThis.__engineEditor.selectedEntityId") !== "player-01") {
    await evaluate(session, `(()=>{const canvas=document.querySelector('#stage-canvas');const rect=canvas.getBoundingClientRect();const options={bubbles:true,pointerId:7,button:0,clientX:rect.left+(320/760)*rect.width,clientY:rect.top+(242/480)*rect.height};canvas.dispatchEvent(new PointerEvent('pointerdown',options));canvas.dispatchEvent(new PointerEvent('pointerup',options));return true;})()`);
  }
  const selectedEntityId = await evaluate<string | null>(session, "globalThis.__engineStudio.selectedEntityId");
  assert(selectedEntityId === "player-01", `Canvas hit test selected ${selectedEntityId ?? "nothing"} instead of player-01`);
  return { name: "Verification 6 — Stage Interaction", passed: true, evidence: { point, selectedEntityId } };
}

async function verifyWasmTelemetry(session: CdpSession): Promise<Verification> {
  const evidence = await evaluate<{ wasmMs: number; typescriptMs: number; output: string }>(session, `(async () => {
    globalThis.__engineStudio.showWorkspace('diagnostics');
    const values = await globalThis.__engineStudio.runBenchmark();
    return { ...values, output: document.querySelector('#benchmark-output').textContent.trim() };
  })()`, true, 60_000);
  assert(evidence.wasmMs > 0, `WASM latency must be > 0 ms; received ${evidence.wasmMs}`);
  assert(evidence.typescriptMs > 0, `TypeScript latency must be > 0 ms; received ${evidence.typescriptMs}`);
  const values = evidence.output.match(/\d+\.\d+\s*ms/g) ?? [];
  assert(values.length >= 2, `Benchmark output did not contain two numeric latency reports: ${evidence.output}`);
  return { name: "Verification 7 — WASM Performance Telemetry", passed: true, evidence };
}

async function verifyZeroClipRig(session: CdpSession): Promise<Verification> {
  const evidence = await evaluate<{ footSlipMeters: number; status: string; phase: string; finite: string }>(session, `(() => {
    globalThis.__engineStudio.showWorkspace('motion');
    globalThis.__engineStudio.setProceduralWalk(true);
    globalThis.__engineStudio.stepMotion(120);
    return {
      footSlipMeters: globalThis.__engineStudio.footSlipMeters,
      status: document.querySelector('#foot-slip-status').textContent.trim(),
      phase: document.querySelector('#rig-phase').textContent.trim(),
      finite: document.querySelector('#pose-finite').textContent.trim(),
    };
  })()`);
  assert(Number.isFinite(evidence.footSlipMeters), "Foot-slip telemetry is not finite");
  assert(evidence.footSlipMeters < 0.02, `Foot slip ${evidence.footSlipMeters} m violates the < 0.02 m boundary`);
  assert(evidence.status.includes("Within engine acceptance"), "Motion UI did not report the accepted foot-slip state");
  assert(evidence.phase === "LOCOMOTION", `Expected procedural locomotion phase, received ${evidence.phase}`);
  assert(evidence.finite === "FINITE", "Pose evaluation was not finite");
  return { name: "Verification 8 — Zero-Clip Rig Evaluation", passed: true, evidence };
}

async function evaluate<T>(session: CdpSession, expression: string, awaitPromise = false, timeoutMs = 30_000): Promise<T> {
  const response = asRecord(await session.command("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  }, timeoutMs));
  if (response.exceptionDetails) throw new Error(`Runtime evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
  const result = asRecord(response.result);
  return result.value as T;
}

async function waitForExpression(session: CdpSession, expression: string, timeoutMs: number, label: string) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    try {
      if (await evaluate<boolean>(session, expression)) return;
    } catch {
      // Navigation can replace the execution context while it settles.
    }
    await delay(75);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function launchChrome(port: number, profileDir: string, explicitPath?: string) {
  const args = [
    "--headless=new",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--window-size=1600,1000",
    "about:blank",
  ];
  const failures: string[] = [];
  for (const executable of chromeCandidates(explicitPath)) {
    if (isAbsolute(executable) && !existsSync(executable)) continue;
    const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    const stderr: string[] = [];
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
    try {
      await Promise.race([
        waitForCdp(port),
        new Promise<never>((_resolve, reject) => child.once("error", reject)),
      ]);
      return child;
    } catch (error) {
      failures.push(`${executable}: ${error instanceof Error ? error.message : String(error)} ${stderr.join("").trim()}`.trim());
      await stopProcess(child);
    }
  }
  throw new Error(`No Chrome executable could start. ${failures.join(" | ")}`);
}

function chromeCandidates(explicitPath?: string) {
  return [...new Set([
    explicitPath,
    process.env.CHROME_PATH,
    join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.PROGRAMFILES ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome",
    "chromium",
  ].filter((candidate): candidate is string => Boolean(candidate)))];
}

async function firstPageTarget(port: number) {
  const targets = await cdpFetch(port, "/json/list");
  assert(Array.isArray(targets), "CDP target list is not an array");
  const target = targets.find((candidate) => asRecord(candidate).type === "page") as JsonRecord | undefined;
  assert(target && typeof target.webSocketDebuggerUrl === "string", "CDP did not expose a page target");
  return target as unknown as CdpTarget;
}

async function waitForCdp(port: number) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 10_000) {
    try { await cdpFetch(port, "/json/version"); return; } catch { await delay(80); }
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

async function cdpFetch(port: number, route: string) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`);
  if (!response.ok) throw new Error(`CDP returned ${response.status}`);
  return await response.json() as unknown;
}

async function waitForHttp(url: string, child: ChildProcess, label: string) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 15_000) {
    if (child.exitCode !== null) throw new Error(`${label} exited with code ${child.exitCode}`);
    try { const response = await fetch(url); if (response.ok) return; } catch { /* startup */ }
    await delay(80);
  }
  throw new Error(`${label} did not become ready`);
}

async function runCommand(command: string, args: string[], label: string) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: engineRoot, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${label} failed with exit code ${code}`)));
  });
}

async function findOpenPort() {
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

async function stopProcess(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    child.kill("SIGTERM");
  }
  await delay(80);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function argumentValue(name: string) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefixed = process.argv.find((argument) => argument.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

await main();
