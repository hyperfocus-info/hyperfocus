import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { startManagedServer } from "@hyperfocus/desktop-runtime/automation/managed-server";
import { inspectBrowserWindows } from "@hyperfocus/desktop-runtime/automation/windows-inspection";
import { chromium } from "playwright";
import { readValueFrame, encodeValue } from "@hyperfocus/serialization";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createWorkspaceRepository } from "../../cli/src/workspace-repository";

const root = path.resolve(import.meta.dir, "../../../..");
const output = path.join(root, ".local/thread-collaboration/ui", crypto.randomUUID());
const projectRoot = path.join(output, "coordination-project");
mkdirSync(projectRoot, { recursive: true });
const dbPath = path.join(output, "workspace.sqlite");
const repository = createWorkspaceRepository(dbPath, projectRoot);
const project = repository.addProject(projectRoot);
repository.renameThread(project.id, project.activeThreadId, "Plan the migration");
const run = repository.createAgentRun(project.id, "Review the migration", "openai/gpt-5.4", project.activeThreadId).activeRun!;
const child = repository.ensureSubagentThread({ projectId: project.id, parentThreadId: project.activeThreadId,
  runId: run.id, subagentId: "review", title: "Review parser compatibility", instruction: "Check the parser boundary" });
const recipient = repository.createThread(project.id).activeThreadId;
repository.renameThread(project.id, recipient, "Review integration");
repository.activateThread(project.id, child);
repository.setBlockChatOnDirtyGitDefault(false);
repository.setGlobalExecutionPaused(true);
repository.close();
const server = await startManagedServer({ supervisor: { command: [process.execPath, path.join(root, ".agents/skills/dev-server/scripts/dev.ts")], cwd: root },
  surface: "harness", healthPath: "/", env: { HARNESS_DB_PATH: dbPath, HARNESS_UI_OUTPUT_DIR: path.join(output, "ui-dist") } });
const openBrowser = () => connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
let owned: Awaited<ReturnType<typeof openBrowser>> | undefined;
const errors: string[] = [];
let activePage: import("playwright").Page | undefined;
try {
  owned = await openBrowser();
  const windows = inspectBrowserWindows({ pid: owned.pid });
  if (windows.visibleWindows.length) throw new Error("Verification browser exposed a visible window");
  const page = await owned.browser.newPage({ viewport: { width: 1365, height: 900 } });
  activePage = page;
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => errors.push(error.message));
  await page.routeWebSocket("**/ws*", socket => {
    const upstream = socket.connectToServer();
    let thinkingFixture = true;
    // Render a thinking child while the real host remains paused. The actual
    // queue, lineage, attribution, rejection and reload use the real database.
    upstream.onMessage(data => {
      const event = typeof data === "string" ? JSON.parse(data) : readValueFrame(data);
      function thinkingChild(value: any) {
        if (!value || typeof value !== "object") return;
        if (value.id === child && value.lineage) value.lineage.status = "running";
        for (const item of Object.values(value)) thinkingChild(item);
      }
      if (thinkingFixture && event.payload?.executionControl) event.payload.executionControl.isPaused = false;
      thinkingChild(event.payload);
      socket.send(typeof data === "string" ? JSON.stringify(event) : Buffer.from(encodeValue(event)));
    });
    socket.onMessage(data => {
      const command = typeof data === "string" ? JSON.parse(data) : readValueFrame(data);
      if (command.type === "chat.send" || command.type === "run.execute") {
        errors.push(`Unexpected inference command: ${command.type}`);
        return;
      }
      if (command.type === "execution.pause-all") thinkingFixture = false;
      upstream.send(data);
    });
  });
  await page.goto(server.url);
  console.log("Checking queued input");
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.waitFor();
  await composer.fill("Check empty parser input after this turn");
  await composer.press("Enter");
  await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.value === "");
  await page.getByText("Queued for the next turn:", { exact: false }).filter({ visible: true }).first().waitFor();
  console.log("Checking rejected steering");
  await composer.fill("Steer this active review");
  await composer.press("Control+Enter");
  await page.getByText("This runtime or phase cannot receive", { exact: false }).first().waitFor();
  if (await composer.inputValue() !== "Steer this active review") throw new Error("Rejected steering lost its draft");
  await page.getByRole("button", { name: "Pause new executions", exact: true }).click();
  console.log("Checking lineage and recipient send");
  await page.getByRole("button", { name: "More thread actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Threads and subagents", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Threads and subagents" });
  await dialog.getByText("Subagent of", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Review integration", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Message to thread" }).fill("Check the integration once the parser review is done");
  await dialog.getByRole("button", { name: "Send message", exact: true }).click();
  await dialog.getByRole("button", { name: "Queued", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, "mobile.png") });
  const box = await dialog.boundingBox();
  if (!box || box.x < 0 || box.x + box.width > 391) throw new Error("Thread dialog exceeds the mobile viewport");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.reload();
  console.log("Checking reload");
  await page.getByText("Queued for the next turn:", { exact: false }).filter({ visible: true }).first().waitFor();
  const stored = createWorkspaceRepository(dbPath, projectRoot);
  try {
    if (stored.listQueuedThreadMessages().length !== 2) throw new Error("Expected two durable queued messages");
    if (!stored.getThreadMessages(project.id, recipient).some(message => message.metadata?.type === "thread-message" && message.metadata.sourceThreadId === child)) throw new Error("Recipient lost sender attribution");
  } finally { stored.close(); }
  if (errors.length) throw new Error(errors.join("\n"));
  await Bun.write(path.join(output, "receipt.json"), JSON.stringify({ passed: true, serverId: server.id,
    queueOnEnter: true, rejectedSteeringRetainsDraft: true, lineageVisible: true, attributedMessagePersisted: true, visibleWindows: windows.visibleWindows, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, output }));
} catch (error) {
  if (activePage) {
    await activePage.screenshot({ path: path.join(output, "failure.png") });
    await Bun.write(path.join(output, "failure.txt"), `${String(error)}\n${await activePage.locator("body").innerText()}`);
  }
  throw error;
} finally {
  await owned?.close();
  await server.close();
}
