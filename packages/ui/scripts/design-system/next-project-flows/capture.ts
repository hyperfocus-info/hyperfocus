import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { createWorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const phase = process.env.DESIGN_CAPTURE_PHASE ?? "after";
const output = `.local/design-system/evidence/next-project-flows/${phase}`;
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: unknown[] = [];
const errors: string[] = [];
const commands = new Set<string>();
try {
  const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve("scripts/process-policy/windows-inspection.ts"), String(owned.pid)] });
  const windows = JSON.parse(inspection.stdout.toString());
  if (windows.visibleWindows.length) throw new Error("Visible browser window");
  await Bun.write(`${output}/browser-windows.json`, JSON.stringify(windows.visibleWindows));
  const page = await owned.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : route.abort());
  await page.routeWebSocket("**/*", socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (typeof message !== "string") return;
      const event = JSON.parse(message);
      results.push({ command: event.type });
      commands.add(event.type);
      if (event.type === "connection.ping") socket.send(JSON.stringify({ type: "connection.pong", requestId: event.requestId, payload: {} }));
    });
    server.onMessage(message => {
      if (typeof message !== "string") return;
      const frame = JSON.parse(message);
      const event = frame.type === "server.events-batch" ? frame.payload.events.find((item: {type:string}) => item.type === "connection.ready") : frame;
      if (event?.type !== "connection.ready") return;
      event.payload.workspace = { projects: [createWorkspaceProjectState({ id: "fixture", name: "Customer preview", rootPath: "C:/Work/customer-preview" }), createWorkspaceProjectState({ id: "second", name: "Research workspace with a long localized project name", rootPath: "C:/Work/Research/workspaces/customer-feedback-analysis-and-localization" })], workspaceModes: [], activeProjectId: "fixture" };
      event.payload.backgroundJobs = { jobs: [], runs: [], templates: [] };
      event.payload.assistants = { assistants: [], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] };
      event.payload.notifications = { items: [
        { id: "question", kind: "planning-question", interactive: true, createdAt: new Date().toISOString(), projectId: "fixture", threadId: "thread", runId: "run", questionId: "question", prompt: "Which release checks should run before the customer preview?", placeholder: "Explain your priorities", choices: [{ id: "quick", label: "Build only", description: "Check packaging", answerText: "Build", recommended: false }, { id: "tests", label: "Tests only", description: "Check behavior", answerText: "Test", recommended: false }, { id: "safe", label: "Run the full checks", description: "Validate the build and focused tests.", answerText: "Run all checks", recommended: true }] },
        { id: "status", kind: "background-run-status", interactive: false, createdAt: new Date().toISOString(), backgroundRunId: "run", jobId: "job", projectId: "fixture", threadId: "thread", title: "Overnight build needs attention", summary: "The packaging step failed. Open the run to inspect its output before retrying.", severity: "error" },
      ], unreadCount: 2, interactiveUnreadCount: 1, passiveUnreadCount: 1 };
      socket.send(JSON.stringify(event));
    });
  });
  await page.goto(process.env.HARNESS_URL ?? "http://127.0.0.1:8787");
  await page.getByRole("button", { name: "Open notification inbox", exact: true }).waitFor();
  if (await page.getByText("Invalid server event", {exact: true}).count()) throw new Error("Fixture rejected");
  for (const surface of ["projects", "assistant", "inbox"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (surface === "projects") await page.getByRole("button", { name: "Open project switcher", exact: true }).first().click();
    if (surface === "assistant") {
      await page.getByRole("tab", { name: "Assistants", exact: true }).click();
      await page.getByRole("button", { name: "New assistant", exact: true }).first().click();
    }
    if (surface === "inbox") await page.getByRole("button", { name: "Open notification inbox", exact: true }).click();
    for (const [size, width, height] of [["desktop",1440,1000],["mobile",390,844],["short",390,600],["text200",820,1000]] as const) {
      await page.setViewportSize({width,height});
      await page.evaluate(scale => { document.documentElement.style.fontSize = scale; }, size === "text200" ? "200%" : "");
      await page.mouse.move(0,0);
      await page.screenshot({path:`${output}/${surface}-${size}.png`});
      const selector = surface === "inbox" ? '[data-test-popover-content]' : '[role="dialog"]';
      const geometry = await page.locator(selector).last().evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.clientHeight }));
      if (phase === "after" && geometry.scrollWidth > geometry.width + 1) throw new Error(`${surface} overflows: ${JSON.stringify(geometry)}`);
      results.push({surface,size,geometry});
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({width:390,height:844});
    if (phase === "after" && surface === "projects") {
      const input = page.getByRole("textbox", {name:"Search projects or enter a folder path"});
      await input.press("ArrowDown");
      if (!(await page.locator("#project-switcher-selection").textContent())?.includes("Research workspace")) throw new Error("Arrow selection was not announced");
      await input.fill("C:/Work/new-preview");
      await input.press("Enter");
      await page.screenshot({path:`${output}/projects-exact-path.png`});
    }
    if (phase === "after" && surface === "assistant") {
      await page.getByLabel("Name",{exact:true}).fill("Release reviewer");
      await page.getByLabel("Personality prompt",{exact:true}).fill("Explain findings clearly.");
      await page.getByLabel("Job prompt",{exact:true}).fill("Review releases and report failures.");
      const execution = page.locator("summary").filter({hasText:"Execution and scope"});
      await execution.focus();
      await page.keyboard.press("Enter");
      if (!await page.getByRole("button",{name:"Select assistant execution model",exact:true}).isVisible()) throw new Error("Execution disclosure did not open");
      await page.getByRole("button",{name:"Select assistant execution model",exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:`${output}/assistant-execution.png`});
      await execution.click();
      await page.getByRole("button",{name:"Create assistant",exact:true}).click();
      results.push({check:"Filled required prompts and dispatched assistant.create from collapsed defaults"});
    }
    if (phase === "after" && surface === "inbox") {
      const question = page.getByRole("button",{name:/Which release checks/});
      await question.focus();
      await page.keyboard.press("Enter");
      if (await question.getAttribute("aria-expanded") !== "true") throw new Error("Question expansion missing");
      await page.getByRole("textbox",{name:"Custom planning answer"}).fill("Run the build first.");
      await page.screenshot({path:`${output}/inbox-response.png`});
      await page.getByRole("button",{name:"Send custom planning answer"}).click();
      results.push({check:"Keyboard question expansion and custom answer command"});
    }
    await page.keyboard.press("Escape");
  }
  if (phase === "after") {
    for (const command of ["project.create", "assistant.create", "planning.answer"]) {
      if (!commands.has(command)) throw new Error(`Expected intercepted ${command}`);
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
} finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ phase, results, errors, fixture: "Real app with intercepted commands; no runtime mutations" }, null, 2));
  try { await owned.browser.close(); } finally { await owned.close(); }
}
