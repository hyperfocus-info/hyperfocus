import { browserExecutable, connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { startManagedSwarmHost } from "./browser/managed-host";
import { swarmGit } from "@hyperfocus/ai-runtime/swarm";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { chromium, type Page } from "playwright";
import { createSwarmHttpFixture } from "../../cli/src/swarm/test-fixture";
import { createSwarmBrowserAccessHandler } from "../../cli/src/swarm/browser/access";
import { createSwarmSiteHandler } from "../../cli/src/swarm/browser/site";
import { buildSwarmSite } from "./build-site";
import { verifyOutcomeReview } from "./browser/outcome-review";
import { inspectWindowsProcessTrees } from "@hyperfocus/desktop-runtime/automation/windows-inspection";
import { createConnectionManager } from "@hyperfocus/ai-runtime/connections";
import { createOperationStore } from "@hyperfocus/ai-runtime/operations";
import { createConnectionHttpHandler } from "../../cli/src/connections/http";

const repositoryRoot = resolve(import.meta.dir, "../../../..");
const linkOnly=process.argv.includes("--link-only");
const connectionsOnly=process.argv.includes("--connections-only");
const outputArgument = process.argv.indexOf("--out");
const output = resolve(repositoryRoot, outputArgument >= 0 ? process.argv[outputArgument + 1]! : connectionsOnly?".local/swarm/native-connections-ui":linkOnly ? ".local/swarm/native-link-ui" : ".local/swarm/workflow-ui");
const scratch = resolve(repositoryRoot, "apps/harness/.local/swarm-ui-fixtures");
await mkdir(scratch, { recursive: true }); await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(scratch, "run-"));
const projectRoot = join(temporary, "project"); await mkdir(projectRoot);
await writeFile(join(projectRoot, "demo.txt"), "baseline\n");
await writeFile(join(projectRoot, ".gitignore"), ".local/\n");
for (const args of [["init"], ["config", "core.autocrlf", "false"], ["config", "user.email", "fixture@localhost"], ["config", "user.name", "Swarm fixture"], ["add", "."], ["commit", "-m", "Simulated UI fixture baseline"]]) await swarmGit({ root: projectRoot, args });
await writeFile(join(projectRoot, "notes.txt"), "Unrelated local work must survive integration.\n");
let connectionHttp:ReturnType<typeof createConnectionHttpHandler>|undefined;
const fixture = createSwarmHttpFixture({ directory: temporary, projectIds: ["editor-workspace"], verifyGitIntegration: true,
  ...connectionsOnly?{connectionAccess:(input:unknown)=>connectionHttp!.mint(input)}:{} });
// Test-only transport: real coordinator, host UI, Git patching and tiny trusted checks; no model/cloud/benchmark workload.
let fixtureHandler=fixture.handler;
const service = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request=>fixtureHandler(request) });
const operations=createOperationStore(fixture.store.db,fixture.store.agentEvents);
const connections=createConnectionManager({operations,adapters:["codex-account","railway"].map(id=>({
  descriptor:{id,providerId:id,label:id==="railway"?"Railway":"Codex",ownerId:"fixture",capabilities:["fixture"],authorizationScope:"SIMULATED provider; no credentials.",authentication:"host-managed" as const,billingMode:"none" as const},
  async inspect(){return {state:"ready" as const,credentialSource:"ambient" as const,summary:"SIMULATED provider connected."};}
}))});
if(connectionsOnly){
  connectionHttp=createConnectionHttpHandler({db:fixture.store.db,manager:connections,operations,token:fixture.token,publicOrigin:service.url.origin,authorizeProject:id=>{if(!fixture.recipes.has(id))throw Error("Unknown project.");}});
  fixtureHandler=createSwarmSiteHandler({directory:(await buildSwarmSite()).output,publicOrigin:service.url.origin,handler:async request=>await connectionHttp!.handle(request)??fixture.handler(request)});
}
if(linkOnly)fixtureHandler=createSwarmSiteHandler({directory:(await buildSwarmSite()).output,publicOrigin:service.url.origin,handler:createSwarmBrowserAccessHandler({...fixture,publicOrigin:service.url.origin,name:id=>fixture.recipes.get(id)?.name})});
await fixture.coordinator.startLoop();
const owned = await connectHeadlessBrowser({ executable: browserExecutable(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const managed: Awaited<ReturnType<typeof startManagedSwarmHost>>[] = [];
const results: unknown[] = [];

async function startManaged(surface: "harness" | "editor") {
  const server = await startManagedSwarmHost({ surface, root: repositoryRoot, environment: { ...process.env, HYPERFOCUS_SWARM_URL: service.url.origin, HYPERFOCUS_SWARM_TOKEN: fixture.token, HYPERFOCUS_SWARM_PROJECT_ROOT: projectRoot, AI_HARNESS_TEMPLATE_HOME: join(temporary, "harness-home"), HARNESS_DB_PATH: join(temporary, "harness.sqlite") } });
  managed.push(server); return server;
}
async function stopManaged(server: typeof managed[number]) { await server.stop(); }

async function selectLocalBackend(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Run with Swarm", exact: true });
  await dialog.getByText("Limits and execution settings", { exact: true }).click();
  await dialog.getByRole("button", { name: "Execution backend", exact: true }).click();
  await page.getByRole("option", { name: /Local execution/ }).click();
  await dialog.getByText("Limits and execution settings", { exact: true }).click();
}

try {
  for (const surface of ["harness", "editor"] as const) {
    if (process.argv.includes("--editor-only") && surface !== "editor") continue;
    await writeFile(join(projectRoot, "demo.txt"), "baseline\n");
    const server = await startManaged(surface);
    const processInspection = process.platform === "win32" ? inspectWindowsProcessTrees({ rootPids: [server.child.pid] }) : undefined;
    if (processInspection?.visibleWindows.length) throw new Error("The owned managed fixture opened a visible process window.");
    if (surface === "harness") {
      const response = await fetch(new URL("/api/desktop/v1/status", server.url));
      const status = await response.json();
      const opened = await fetch(new URL("/api/desktop/v1/open", server.url), { method: "POST", headers: { "content-type": "application/json", "x-harness-session-token": status.sessionToken }, body: JSON.stringify({ target: projectRoot }) });
      const project = await opened.json(); if (!opened.ok || typeof project.projectId !== "string") throw new Error("Fixture project could not open in Harness.");
      fixture.recipes.set(project.projectId, { ...fixture.recipes.get("editor-workspace")!, id: project.projectId });
    }
    const context = await owned.browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const artifactRequests:unknown[]=[];
    page.on("response",response=>{if(response.url().includes("/artifacts/"))artifactRequests.push({url:response.url(),status:response.status()});});
    try {
      await page.goto(server.url, { waitUntil: "domcontentloaded" });
      if (surface === "editor") { const center = page.getByRole("button", { name: "Close project center", exact: true }); if (await center.isVisible()) await center.click(); await page.getByRole("button", { name: "Open AI project actions", exact: true }).click(); }
      let approvedRunId = "";
      let outcomeReview: Awaited<ReturnType<typeof verifyOutcomeReview>> | undefined;
      for (const mode of connectionsOnly?["connections"]:linkOnly ? ["link"] : ["review", "[fail]", "[cancel]", "approve"]) {
        await page.locator(`[data-test-${surface}-run-with-swarm]`).click();
        const dialog = page.getByRole("dialog", { name: "Run with Swarm", exact: true });
        if(connectionsOnly){
          await dialog.getByRole("button",{name:"Manage remote connections",exact:true}).click();
          const link=dialog.getByRole("link",{name:"Open Connections",exact:true});await link.waitFor();
          const popupOpened=page.waitForEvent("popup");await link.click();const popup=await popupOpened;
          await popup.getByRole("region",{name:"Codex connection"}).getByText("SIMULATED provider connected.",{exact:true}).waitFor();
          if(new URL(popup.url()).hash)throw Error("Connections bootstrap remained in URL.");
          await popup.bringToFront();await popup.screenshot({path:join(output,`${surface}-connections.png`),timeout:10000});await popup.close();
          await page.bringToFront();await page.screenshot({path:join(output,`${surface}-entry.png`),timeout:10000});
          await dialog.getByRole("button",{name:"Close dialog",exact:true}).click();continue;
        }
        await dialog.getByRole("button", { name: "Task run", exact: true }).click();
        await page.locator('[data-select-option=""]').click();
        await dialog.getByRole("button", { name: "Prepare swarm plan", exact: true }).waitFor();
        await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[data-test-task-request-form] button[type="submit"]')?.disabled);
        await dialog.getByRole("textbox", { name: "Engineering goal", exact: true }).fill(`SIMULATED TEST WORKLOAD ${mode}: compare three independent candidates to verify host UI and tiny Git integration only`);
        await selectLocalBackend(page);
        await dialog.getByRole("button", { name: "Prepare swarm plan", exact: true }).click();
        if(linkOnly){
          await dialog.getByRole("button",{name:"Launch workers",exact:true}).waitFor();
          await dialog.getByText("Cloud link",{exact:true}).click();
          const issued=page.waitForResponse(response=>response.url().endsWith("/browser-access") && response.request().method()==="POST");
          await dialog.getByRole("button",{name:"Create cloud link",exact:true}).click();
          if(!(await issued).ok())throw new Error("Native cloud link issuance failed.");
          const popupOpened=page.waitForEvent("popup");await dialog.getByRole("link",{name:"Open cloud page",exact:true}).click();
          const popup=await popupOpened;await popup.getByText(/^Read-only access/).waitFor();
          if(new URL(popup.url()).hash)throw new Error("Public link code remained visible.");
          await popup.getByRole("main",{name:"Run with Swarm",exact:true}).getByText(/^Plan ready/).waitFor();
          await popup.bringToFront();await popup.screenshot({path:join(output,`${surface}-public.png`),animations:"disabled",timeout:10000});await popup.close();
          await page.bringToFront();await page.screenshot({path:join(output,`${surface}-link.png`),animations:"disabled",timeout:10000});
          await dialog.getByRole("button",{name:"Cancel run",exact:true}).click();await dialog.getByText("Cancelled",{exact:true}).waitFor();
          await dialog.getByRole("button",{name:"Close dialog",exact:true}).click();continue;
        }
        await dialog.getByRole("button", { name: "Launch workers", exact: true }).click({ timeout: 30_000 });
        if (mode === "[cancel]") {
          await dialog.getByRole("button", { name: "Cancel run", exact: true }).click();
          await dialog.getByText("Cancelled",{exact:true}).waitFor();
        } else if (mode === "[fail]") await dialog.getByText("Failed",{exact:true}).waitFor({ timeout: 30_000 });
        else {
          await dialog.getByText(/^Waiting for approval/).waitFor({ timeout: 60_000 });
          if (mode === "review") outcomeReview = await verifyOutcomeReview({ page, surface, output });
          await dialog.getByRole("button", { name: "Review patch", exact: true }).first().click();
          await dialog.locator("[data-test-task-review-artifact] pre").waitFor();
          if (!(await dialog.locator("[data-test-task-review-artifact] pre").innerText()).includes("+candidate-1")) throw new Error("Candidate patch was not retrieved through the authenticated proxy.");
          if (mode === "approve") {
            const stagedBefore = (await swarmGit({ root: projectRoot, args: ["diff", "--cached"] })).output;
            const accepted = page.waitForResponse(response => response.url().endsWith("/approve") && response.request().method() === "POST");
            await dialog.locator('[data-candidate-id="candidate-1"]').getByRole("button", { name: "Approve and integrate", exact: true }).click();
            const response = await accepted; const result = await response.json();
            if (!response.ok() || result.integration?.status !== "integrated" || result.status !== "COMPLETED") throw new Error(`Tiny Git approval failed: ${JSON.stringify(result)}`);
            approvedRunId = result.id;
            await dialog.getByText(/^Integration: integrated/).waitFor();
            if (await readFile(join(projectRoot, "demo.txt"), "utf8") !== "candidate-1\n") throw new Error("The reviewed candidate patch was not applied to the tiny fixture.");
            if (await readFile(join(projectRoot, "notes.txt"), "utf8") !== "Unrelated local work must survive integration.\n" || (await swarmGit({ root: projectRoot, args: ["diff", "--cached"] })).output !== stagedBefore) throw new Error("Integration changed unrelated files or staged work.");
            await writeFile(join(projectRoot, "demo.txt"), "Developer edit after integration.\n");
            const duplicate = await page.evaluate(async runId => {
              const token = document.querySelector<HTMLMetaElement>('meta[name="harness-session-token"]')?.content;
              const response = await fetch(`/api/swarm/v1/runs/${runId}/approve`, { method: "POST", headers: { "content-type": "application/json", ...token ? { "x-harness-session-token": token } : {} }, body: JSON.stringify({ candidateId: "candidate-1" }) });
              return { status: response.status, run: await response.json() };
            }, approvedRunId);
            if (duplicate.status !== 200 || duplicate.run.integration?.status !== "integrated" || await readFile(join(projectRoot, "demo.txt"), "utf8") !== "Developer edit after integration.\n") throw new Error("Repeated approval overwrote later developer work.");
            if (fixture.integrationVerifications.filter(receipt => receipt.runId === approvedRunId).length !== 1) throw new Error("Approval did not perform exactly one independent post-integration verification.");
          } else {
            await dialog.getByText("Task graph and workers", { exact: true }).click();
            await dialog.locator("[data-test-task-review-candidates]").scrollIntoViewIfNeeded();
            await page.screenshot({ path: join(output, `${surface}-review-desktop.png`), fullPage: true });
            await page.setViewportSize({ width: 390, height: 844 });
            await page.screenshot({ path: join(output, `${surface}-review-narrow.png`), fullPage: true });
            await page.setViewportSize({ width: 1440, height: 1000 });
            await dialog.getByRole("button", { name: "Reject candidate", exact: true }).first().click();
            await dialog.locator('[data-candidate-id="candidate-1"]').getByText("rejected", { exact: true }).waitFor();
            await dialog.getByRole("button", { name: "Finish without integrating", exact: true }).click();
            await dialog.getByText("Completed",{exact:true}).waitFor();
          }
        }
        await page.screenshot({ path: join(output, `${surface}-${mode.replace(/[\[\]]/g, "")}.png`), fullPage: true });
        await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
      }
      const remainingVerificationWorkspaces = await fixture.verificationWorkspaceCount();
      if (remainingVerificationWorkspaces) throw new Error("Tiny Git verification workspaces were not cleaned up.");
      if(connectionsOnly){if(errors.length)throw Error("Connections journey produced page errors.");results.push({surface,simulated:true,cloudVerified:false,connectionsLinkIssued:true,connectionsOpened:true,bootstrapRemoved:true,jobsExecuted:0,pageErrors:errors});}
      else if(linkOnly)results.push({surface,simulated:true,cloudVerified:false,cloudLinkIssued:true,publicReadonlyOpened:true,queuedCancelled:true,jobsExecuted:0,remainingVerificationWorkspaces,pageErrors:errors});
      else results.push({ surface, url: server.url, serverId: server.id, simulated: true, cloudVerified: false, outcomeReview, visibleProcessWindows: processInspection?.visibleWindows.length, created: true, started: true, cancelled: true, failed: true, comparison: true, artifactHashVerified: true, rejected: true, approved: true, tinyGitValidation: true, repeatApprovalPreservedLocalEdit: true, remainingVerificationWorkspaces, integration: fixture.integrationVerifications.find(receipt => receipt.runId === approvedRunId), pageErrors: errors });
    } catch (error) { await page.screenshot({ path: join(output, `${surface}-failure.png`), fullPage: true });const body=await page.locator("body").innerText();await writeFile(join(output,`${surface}-failure.json`),JSON.stringify({error:String(error),pageErrors:errors,artifactRequests,body},null,2));throw new Error(`${surface}: ${error instanceof Error ? error.message : error}; page: ${body.slice(-3000)}`); }
    finally { await context.close(); await stopManaged(server); managed.splice(managed.indexOf(server), 1); }
  }
  await Bun.write(join(output, "results.json"), JSON.stringify({ simulated: true, cloudVerified: false, results }, null, 2));
  console.log(JSON.stringify({ output, simulated: true, cloudVerified: false, results }, null, 2));
} finally {
  for (const server of managed) await stopManaged(server);
  await owned.close(); service.stop(true); await connections.close();await fixture.close();
  if (!resolve(temporary).startsWith(scratch + sep)) throw new Error("Fixture cleanup escaped its owner.");
  await rm(temporary, { recursive: true, force: true });
}
