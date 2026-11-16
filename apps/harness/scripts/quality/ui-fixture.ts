import { agentRunStateSchema, createChatMessage, createEmptySession, createWorkspaceProjectState, serverEventSchema, clientCommandSchema, type ClientCommand } from "@hyperfocus/ai-core/protocol";
import { defaultProviderCapabilities } from "@hyperfocus/ai-core/capabilities";
import { appendQualityEvent, qualityRules, type QualityTrace } from "@hyperfocus/ai-core/quality";
import type { Page } from "playwright";

const timestamp = "2026-11-01T12:00:00.000Z";
const projectId = "foundation-project", threadId = "foundation-thread", runId = "foundation-run";
export const fixturePath = "C:/UI-verification/disposable-project";

function qualityFixture() {
  const hash = "a".repeat(64);
  const outcomes = [["ui.navigation.no-duplicate-destinations", "passed"], ["ui.interaction.drawer-recovery", "unknown"], ["ui.interaction.focus-restoration", "failed"]] as const;
  const trace: QualityTrace = { schema: "hyperfocus-quality-trace-v1", runId, taskId: "foundation-task", profile: "implementation", intentSha256: hash,
    handoffs: [], events: [], limitations: ["Intercepted browser fixture; no live model or filesystem mutation."],
    rules: outcomes.map(([id]) => {
      const rule = qualityRules.find(value => value.id === id);
      if (!rule) throw new Error(`Missing quality rule ${id}`);
      return { id, version: rule.version, sha256: hash, source: rule.source, scope: rule.scope, category: rule.category, severity: rule.severity,
        verifierIds: rule.verifierIds, eligible: "yes", rationale: "Required for this workflow." };
    }) };
  for (const rule of trace.rules) {
    appendQualityEvent(trace, { agentId: "main", stage: "selection", outcome: "selected", ruleId: rule.id, ruleSha256: hash, reason: "Selected", evidenceRefs: [] });
    appendQualityEvent(trace, { agentId: "main", stage: "context-delivery", outcome: "delivered", ruleId: rule.id, ruleSha256: hash, boundary: "sdk-prompt", reason: "Delivered", evidenceRefs: [] });
  }
  appendQualityEvent(trace, { agentId: "main", stage: "implementation", outcome: "passed", candidateSha256: hash, reason: "Candidate completed", evidenceRefs: [] });
  for (const [id, outcome] of outcomes) {
    const rule = trace.rules.find(value => value.id === id);
    if (!rule) throw new Error("Missing selected rule");
    for (const verifierId of rule.verifierIds) appendQualityEvent(trace, { agentId: "main", stage: "verification", outcome, ruleId: id, ruleSha256: hash,
      candidateSha256: hash, verifierId, boundary: "host-verifier", reason: outcome === "failed" ? "Focus did not return to the trigger." : "Fixture verifier result.", evidenceRefs: ["checks/fixture-result.json"] });
  }
  return trace;
}

/** The real UI/transport runs against disposable domain state; no client command reaches the runtime. */
export async function installQualityUiFixture(page: Page) {
  const commands: ClientCommand[] = [];
  const project = createWorkspaceProjectState({ id: projectId, name: "UI verification project", rootPath: fixturePath, activeThreadId: threadId,
    session: { ...createEmptySession(threadId), messages: [createChatMessage("assistant", "The navigation change is ready for review. Check the failed focus restoration before accepting it.")] } });
  project.lastRun = agentRunStateSchema.parse({ id: runId, threadId, status: "completed", latestUserPrompt: "Improve the navigation and preserve editing focus.",
    executionModelId: "openai/gpt-5.4", summary: "Navigation change ready for review", questions: [], subtasks: [], resumable: false, retryable: true,
    createdAt: timestamp, updatedAt: timestamp, completedAt: timestamp, detailState: "complete",
    plan: { runId, origin: "initial", iteration: 1, summary: "Navigation change ready for review", finalExecutionBrief: "Improve navigation and preserve focus.",
      difficultyScore: 40, planningModelId: "openai/gpt-5.4", executionModelId: "openai/gpt-5.4", route: "main", subagentWorktreeStrategy: "same-worktree", targetSubagentCount: 1,
      actualSubagentCount: 1, gating: { mode: "countdown", delaySeconds: 10 }, prerequisites: [], contracts: [], correctnessPolicy: "ask-before-iterate", quality: qualityFixture() } });
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : route.abort());
  await page.routeWebSocket("**/*", socket => {
    const server = socket.connectToServer();
    const send = (value: unknown) => socket.send(JSON.stringify(serverEventSchema.parse(value)));
    socket.onMessage(message => {
      if (typeof message !== "string") return;
      const command = clientCommandSchema.parse(JSON.parse(message)); commands.push(command);
      if (command.type === "connection.ping") send({ type: "connection.pong", requestId: command.requestId, payload: {} });
      if (command.type === "project.search") send({ type: "project.search.results", requestId: command.requestId, payload: { query: command.payload.query, results: [] } });
      if (command.type === "project.create" || command.type === "project.add") send({ type: "project.opened", requestId: command.requestId,
        payload: { project, activeProjectId: project.id, resolution: "created-project" } });
    });
    server.onMessage(message => {
      if (typeof message !== "string") return;
      const frame = JSON.parse(message);
      const event = frame.type === "server.events-batch" ? frame.payload.events.find((value: { type: string }) => value.type === "connection.ready") : frame;
      if (event?.type !== "connection.ready") return;
      event.payload.workspace = { projects: [], workspaceModes: [] };
      event.payload.executionControl = { ...event.payload.executionControl, isPaused: false };
      event.payload.preferences = { ...event.payload.preferences, hasUsableApiKey: true, hasUsableOpenAiApiKey: true, providerBrand: "gpt",
        capabilities: [...defaultProviderCapabilities], agentRuntimes: [], tracePanelDefaultOpen: true, blockChatOnDirtyGitDefault: false, checkCliUpdatesDefault: false };
      event.payload.backgroundJobs = { jobs: [], runs: [], templates: [], schedulerHeartbeatAt: timestamp };
      event.payload.assistants = { assistants: [], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] };
      event.payload.notifications = { items: [], unreadCount: 0, interactiveUnreadCount: 0, passiveUnreadCount: 0 };
      send(event);
    });
  });
  return { commands };
}
