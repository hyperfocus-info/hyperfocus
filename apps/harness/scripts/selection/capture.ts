import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { createWorkspaceProjectState, createProjectThreadSummary, createEmptySession } from "@hyperfocus/ai-core/protocol";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(import.meta.dir, "../../../../.local/selection-harness");
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
try {
  const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, "../../../../scripts/process-policy/windows-inspection.ts"), String(owned.pid)] });
  if (inspection.exitCode !== 0) throw new Error(inspection.stderr.toString());
  const windows = JSON.parse(inspection.stdout.toString());
  if (windows.visibleWindows.length) throw new Error("Browser exposed a visible window");
  const page = await owned.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("pi-harness:browser-ui-session:v1", JSON.stringify({ activeProjectId: "selection-project", chatPaneTab: "memory" })));
  const now = new Date().toISOString();
  const entries = Array.from({ length: 30 }, (_, index) => ({ id: `note-${index}`, projectId: "selection-project", kind: "repo-fact", status: index % 3 === 0 ? "archived" : "active", title: `Decision ${index + 1}`, summary: "Keep workspace contracts portable and document the decision.", tags: [`area:surface-${index % 12}`], pinned: index % 2 === 0, priority: index, confidence: "high", freshness: "fresh", pathGlobs: [], hitCount: 0, createdAt: now, updatedAt: now }));
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : route.abort());
  await page.routeWebSocket("**/*", socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (typeof message !== "string") return;
      const event = JSON.parse(message);
      if (event.type === "connection.ping") socket.send(JSON.stringify({ type: "connection.pong", requestId: event.requestId, payload: {} }));
      if (event.type === "memory.list") socket.send(JSON.stringify({ type: "memory.listed", requestId: event.requestId, payload: { projectId: "selection-project", entries } }));
    });
    server.onMessage(message => {
      if (typeof message !== "string") return;
      const frame = JSON.parse(message);
      const event = frame.type === "server.events-batch" ? frame.payload.events.find((item: { type: string }) => item.type === "connection.ready") : frame;
      if (event?.type !== "connection.ready") return;
      const project = createWorkspaceProjectState({ id: "selection-project", name: "Selection audit", rootPath: "C:/SelectionFixture", activeThreadId: "selection-thread", threads: [createProjectThreadSummary({ id: "selection-thread", title: "Selection review", titleSource: "generated", updatedAt: now })], session: createEmptySession("selection-thread") });
      event.payload.workspace = { projects: [project], activeProjectId: project.id, workspaceModes: [] };
      event.payload.executionControl = { ...event.payload.executionControl, isPaused: true };
      event.payload.assistants = { assistants: [], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] };
      socket.send(JSON.stringify(event));
    });
  });
  await page.goto(process.env.HARNESS_URL ?? "http://127.0.0.1:8787");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${output}/initial.png` });
  const memory = page.getByRole("tab", { name: "Memory", exact: true });
  if (await memory.count()) await memory.click();
  await page.getByRole("textbox", { name: "Search project notes" }).waitFor({ timeout: 10_000 });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole("textbox", { name: "Search project notes" }).fill("Decision 11");
    const result = page.getByText("Decision 11", { exact: true });
    if (!await result.isVisible()) throw new Error(`Matching note is hidden at ${width}`);
    await page.screenshot({ path: `${output}/notes-${width}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`Page overflows at ${width}`);
    await page.getByRole("button", { name: "Clear note filters" }).click();
    await page.getByRole("button", { name: "Filter notes by semantic tags" }).click();
    await page.getByRole("searchbox", { name: "Search filter notes by semantic tags" }).fill("surface-10");
    await page.getByRole("checkbox", { name: "area:surface-10" }).check();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.screenshot({ path: `${output}/tags-${width}.png` });
    await page.getByRole("button", { name: "Clear note filters" }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const modelBox = await page.getByRole("button", { name: "Select model", exact: true }).boundingBox();
  const favoriteBox = await page.getByRole("button", { name: /^Favorite Gpt/ }).boundingBox();
  if (!modelBox || !favoriteBox || modelBox.x + modelBox.width > favoriteBox.x) {
    console.log(JSON.stringify({ modelBox, favoriteBox, layout: await page.getByRole("button", { name: "Select model", exact: true }).evaluate(element => { const ancestors = []; let current: Element | null = element; for (let index = 0; current && index < 7; index++, current = current.parentElement) { const style = getComputedStyle(current); ancestors.push({ tag: current.tagName, width: current.getBoundingClientRect().width, display: style.display, flex: style.flex, minWidth: style.minWidth }); } return ancestors; }) }));
    throw new Error("Model selection overlaps its favorite action");
  }
  await page.getByRole("button", { name: "Select model", exact: true }).click();
  await page.getByRole("button", { name: "Favorites", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/model-favorites.png` });
  await page.keyboard.press("Escape");
  if (errors.length) throw new Error(errors.join("\n"));
  await Bun.write(`${output}/result.json`, JSON.stringify({ widths: [1440, 390], errors, visibleWindows: windows.visibleWindows }, null, 2));
  console.log(output);
} finally { await owned.close(); }
