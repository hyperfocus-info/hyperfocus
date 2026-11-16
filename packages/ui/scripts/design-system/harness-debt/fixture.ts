import type { Page, WebSocketRoute } from "playwright";

const fixtureJobs = Array.from({ length: 120 }, (_, index) => ({
  id: `design-job-${index}`, projectId: "design-project", automationThreadId: `design-thread-${index}`,
  kind: index % 3 === 1 ? "shell" : "ai-routine", name: ["Review overnight build failures", "Refresh dependency inventory", "Summarize customer feedback"][index] ?? `Review workspace ${String(index + 1).padStart(3, "0")}`,
  description: index === 0 ? "Check the latest build results and prepare a concise report for the team." : "Keep the workspace ready for the next working session.",
  status: index % 3 === 1 ? "paused" : "enabled", riskLevel: "safe", lane: "exclusive",
  definition: index % 3 === 1 ? { kind: "shell", executable: "echo", args: ["visual-fixture-only"], timeoutSeconds: 30 } : { kind: "ai-routine", prompt: "Prepare a concise workspace report." },
  schedule: { type: "one-off", runAt: "2099-09-20T09:00:00.000Z", sourceText: "Tomorrow at 9am" }, scheduleInput: "Tomorrow at 9am",
  createdAt: "2026-09-19T09:00:00.000Z", updatedAt: "2026-09-19T09:00:00.000Z",
}));

/** Read the server's boot contract; replace domain data before the app receives it.
 * No browser websocket command is forwarded to the real runtime. */
export async function installHarnessDebtFixture(page: Page) {
  const commands: string[] = [];
  let client: WebSocketRoute | undefined;
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  const background = (jobs: readonly object[] = fixtureJobs) => ({ jobs, runs: [fixtureRun], templates: [], schedulerHeartbeatAt: new Date().toISOString() });
  await page.route("**/api/**", async route => {
    if (route.request().method() === "GET") await route.continue();
    else await route.abort();
  });
  await page.routeWebSocket("**/*", socket => {
    client = socket;
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (typeof message !== "string") return;
      const event = JSON.parse(message);
      commands.push(event.type);
      if (event.type === 'run-diagnostics.inspect') socket.send(JSON.stringify({ type:'run-diagnostics.inspected', requestId:event.requestId, payload:{report: healthReport} }));
      if (event.type === "connection.ping") socket.send(JSON.stringify({ type: "connection.pong", requestId: event.requestId, payload: {} }));
    });
    server.onMessage(message => {
      if (typeof message !== "string") return;
      const frame = JSON.parse(message);
      const event = frame.type === "server.events-batch" ? frame.payload.events.find((item: { type: string }) => item.type === "connection.ready") : frame;
      if (event?.type !== "connection.ready") return;
      event.payload.workspace = { projects: [], workspaceModes: [] };
      event.payload.backgroundJobs = background();
      event.payload.executionControl = { ...event.payload.executionControl, isPaused: true };
      event.payload.assistants = { assistants: [], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] };
      event.payload.notifications = { items: [], unreadCount: 0, interactiveUnreadCount: 0, passiveUnreadCount: 0 };
      socket.send(JSON.stringify(event));
      resolveReady();
    });
  });
  return {
    commands,
    ready,
    clear() {
      client?.send(JSON.stringify({ type: "background-jobs.deleted", requestId: "design-fixture-empty", payload: { targets: [{ kind: "project", projectId: "design-project" }], deletedJobIds: fixtureJobs.map(job => job.id) } }));
      client?.send(JSON.stringify({ type: "background-jobs.updated", requestId: "design-fixture-empty", payload: { backgroundJobs: background([]) } }));
    },
    update(jobs: readonly object[] = fixtureJobs) { client?.send(JSON.stringify({ type: "background-jobs.updated", requestId: "design-fixture", payload: { backgroundJobs: background(jobs) } })); },
  };
}


const healthReport = {
  windowDays:7, generatedAt:'2026-09-21T12:00:00.000Z',
  summary: {activeBackoffJobs:1, questionPersistConflictCount:0, agentEmptyResponseCount:2, backgroundFailureCount:4, lifecycleFailureCount:1, lifecycleFailureShare:0.25, dominantBackgroundFailureCategory:'controller-lost'},
  topPromptHashes:[], promptSizeByOwner:[], dailyFailureSeries:[],
  failureBreakdown:[{sourceType:'background-job-run',failureCategory:'controller-lost',count:4,share:1,jobId:'customer-report-localization-like-long-job-name-with-no-truncation'}],
  activeBackoffJobRows:[{jobId:'design-job-0',jobName:'Review overnight build failures for all customer workspaces and long localized names',consecutiveFailureCount:2,backoffUntil:'2026-09-22T12:00:00.000Z',lastFailureCategory:'controller-lost'}]
};

const fixtureRun = {
  id: "design-run-1", jobId: "design-job-0", projectId: "design-project", automationThreadId: "design-thread-0",
  triggerSource: "manual", status: "failed", riskLevel: "safe", approvalStatus: "not-needed", skippedOccurrenceCount: 0,
  summary: "Review finished with a recoverable build failure.", failureMessage: "Build verification failed. Review the latest execution evidence before retrying.",
  queuedAt: "2026-09-21T12:00:00.000Z", startedAt: "2026-09-21T12:00:01.000Z", completedAt: "2026-09-21T12:02:00.000Z",
  createdAt: "2026-09-21T12:00:00.000Z", updatedAt: "2026-09-21T12:02:00.000Z",
  events: Array.from({ length: 120 }, (_, index) => ({ id: `evidence-${index}`, stage: index === 119 ? "failed" : "stdout", message: `Verification step ${index + 1}: ${"Inspect the long localized customer workspace output. ".repeat(6)}`, detail: "Full execution evidence\n" + "customer_workspace_localization_string_".repeat(100), createdAt: "2026-09-21T12:01:00.000Z" })),
};
