import type { Page, WebSocketRoute } from "playwright";

export const fixtureJobs = Array.from({ length: 120 }, (_, index) => ({
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
export async function installJobsFixture(page: Page) {
  const commands: string[] = [];
  let client: WebSocketRoute | undefined;
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  const background = (jobs: readonly object[] = fixtureJobs) => ({ jobs, runs: [], templates: [], schedulerHeartbeatAt: new Date().toISOString() });
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
