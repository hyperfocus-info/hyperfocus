import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createWorkspaceRepository } from "../../cli/src/workspace-repository";
import { buildExecutionPlan, executeReadyRun } from "../../cli/src/pi-orchestrator";
import { createPiSdkExecutionController, type PiExecutionSession } from "../../cli/src/pi-agent/execution-controller";
import { createRunBudgetAgentAdapter } from "../../cli/src/run-budget-agent-adapter";
import type { PiAgentAdapter, PiAgentPromptRequest } from "../../cli/src/pi-agent-adapter";
import { createChatMessage, type PlannerReadyTurn } from "@hyperfocus/ai-core/protocol";
import { qualityCompletionBlock, qualityCoverage, qualityTraceSchema } from "@hyperfocus/ai-core/quality";
import { readTaskQuality } from "./report";
import { qualityPayloadHash } from "../../cli/src/verification/quality-payload";

/** Deterministic transport fixture through the real orchestrator/SDK boundary; no paid model call or source mutation. */
export async function demonstrateQuality(projectRoot: string, output: string) {
  await mkdir(output, { recursive: true });
  const database = join(output, "harness.db");
  let repository = createWorkspaceRepository(database, projectRoot);
  const project = repository.openProject(projectRoot).project;
  const intent = "Verify Books navigation and workbench recovery: fix any lost invoice draft after hiding and reopening.";
  const created = repository.createAgentRun(project.id, intent, "openai/fixture-worker", project.activeThreadId);
  const run = created.activeRun;
  if (!run) throw new Error("Task creation did not retain its run.");
  const tasks = [{ id: "navigation-worker", title: "Navigation", instruction: "Implement sidebar" }, { id: "recovery-worker", title: "Recovery", instruction: "Preserve workbench recovery" }];
  const ready: PlannerReadyTurn = { type: "ready", summary: "Books quality boundary demonstration", difficultyScore: 65, executionModelId: "openai/fixture-worker",
    supervision: { request: intent, intent: "Avoid lost bookkeeping work", outcome: "Resume the same unfinished invoice draft after hiding the workbench",
      experience: "Recover work without retyping", evidence: ["Actual Books keyboard and recovery checks"], constraints: ["Preserve existing draft and unrelated work"],
      budget: "One deterministic two-worker transport replay; no model inference", decision: "continue", reason: "Observed historical recovery failure has an executable oracle" },
    usesSubagents: true, subtasks: tasks, finalExecutionBrief: intent, prerequisites: [], contracts: tasks.map((task, index) => ({ taskId: task.id, title: task.title, instruction: task.instruction,
      effortPoints: 2, ownedPaths: [index ? "src/client/tasks/workbench-menu.tsx" : "src/client/task-navigation.tsx"], dependsOnPrerequisiteIds: [],
      deliverables: ["Preserve existing behavior; deterministic fixture does not edit source."], integrationPoints: [], verificationScope: "owned-files-only", verificationCommands: [], mergeNotes: "Host runs real Books acceptance." })) };
  for (const contract of ready.contracts ?? []) contract.contribution = { outcome: ready.supervision!.outcome,
    limitingFactor: "Recovery and navigation must compose", evidence: "Historical draft-loss journey", expectedImprovement: "Demonstrate exact context delivery and real recovery verification", stopWhen: "Recovery verifier fails" };
  const plan = buildExecutionPlan({ runId: run.id, planningModelId: "openai/fixture-worker", plannerResult: ready, subagentWorktreeStrategy: "same-worktree",
    planExecutionMode: "immediate", planExecutionDelaySeconds: 0, correctnessIterationMode: "ask-before-iterate", iteration: 1, origin: "initial" });
  repository.setAgentRunExecutionPlan(project.id, run.id, plan);
  const baseline = readTaskQuality(database, run.id);
  if (baseline.acceptance !== "UNKNOWN") throw new Error("A task without lifecycle receipts must remain UNKNOWN.");
  await writeFile(join(output, "baseline.json"), JSON.stringify(baseline, null, 2));
  repository.setAgentRunStatus(project.id, run.id, "running-subagents");
  const calls: { kind: string; agentId: string; chars: number; qualityChars: number; payloadSha256?: string }[] = [];
  let snapshotBytes = 0;
  const start = performance.now();
  const adapter: PiAgentAdapter = { setApiKey() {}, hasApiKey: () => true,
    async runPrompt(request) { const execution = await this.startExecution(request); try { return await execution.result; } finally { execution.dispose(); } },
    async startExecution(request: PiAgentPromptRequest) {
      const start = request.prompt.lastIndexOf("[hyperfocus-quality-context-v1]"), end = request.prompt.indexOf("[/hyperfocus-quality-context-v1]", start);
      calls.push({ kind: request.kind, agentId: request.qualityAgentId ?? "main", chars: request.prompt.length,
        qualityChars: start >= 0 && end >= start ? end + "[/hyperfocus-quality-context-v1]".length - start : 0, payloadSha256: qualityPayloadHash(request.prompt) });
      const messages: PiExecutionSession["messages"] = [];
      const session: PiExecutionSession = { messages, subscribe: () => () => {}, abort: async () => {}, dispose() {},
        getSessionStats: () => ({ sessionFile: undefined, sessionId: "fixture", userMessages: 1, assistantMessages: 1, toolCalls: 0, toolResults: 0, totalMessages: 2, cost: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }),
        async prompt(prompt) {
          if (!prompt.includes(ready.supervision!.outcome)) throw new Error("Parent outcome missing at SDK submission.");
          if (!prompt.includes("ui.interaction.drawer-recovery@1") || !prompt.includes("experience.primary-journey-complete@books-1")) throw new Error("Worker did not receive the mandatory Books contracts.");
          messages.push({ role: "assistant", api: "openai-responses", provider: "openai", model: "fixture-worker", content: [{ type: "text", text: "Deterministic boundary fixture completed. No source edits. Independent host verification follows." }], stopReason: "stop", timestamp: Date.now(),
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
        } };
      return createPiSdkExecutionController(session, request, 32000, () => {});
    } };
  try {
    const outcome = await executeReadyRun(createRunBudgetAgentAdapter(adapter, repository, project.id, run.id), { cwd: projectRoot, runId: run.id, sessionId: project.session.sessionId,
      messages: [createChatMessage("user", intent)], readyPlan: ready, executionPlan: plan, providerBrand: "gpt", debugEnabled: false,
      callbacks: { onQuality(trace) { snapshotBytes += Buffer.byteLength(JSON.stringify(trace)); repository.setAgentRunExecutionPlan(project.id, run.id, { ...plan, quality: qualityTraceSchema.parse(trace) }); } } });
    const trace = repository.getRun(project.id, run.id)?.plan?.quality;
    if (!trace) throw new Error("Quality trace was not persisted.");
    const report = qualityCoverage(trace);
    if (report.state !== "VERIFIED") throw new Error(`Demonstration did not verify: ${report.rules.filter(rule => rule.severity === "blocking" && rule.status !== "PASSED").map(rule => `${rule.id}: ${rule.unresolvedReason}`).join("; ")}`);
    repository.completeAgentRun({ projectId: project.id, threadId: run.threadId, runId: run.id, status: outcome.partial ? "partial-complete" : "completed",
      reason: outcome.partialReason ?? "Independent Books checks passed", assistantMessageContent: outcome.assistantMessage.content });
    await writeFile(join(output, "coverage.json"), JSON.stringify(report, null, 2));
    await writeFile(join(output, "trace.json"), JSON.stringify(trace, null, 2));
    const mutations = ["dropped-handoff", "skipped-verifier"].map(mutation => {
      const altered = structuredClone(trace), ruleId = "ui.interaction.drawer-recovery";
      if (mutation === "dropped-handoff") altered.handoffs[0]!.requiredRules = altered.handoffs[0]!.requiredRules.filter(rule => rule.id !== ruleId);
      else {
        const event = altered.events.filter(event => event.stage === "verification" && event.ruleId === ruleId).at(-1)!;
        event.outcome = "skipped"; event.reason = "Controlled mutation: mandatory recovery verifier skipped.";
      }
      const result = qualityCoverage(altered), row = result.rules.find(rule => rule.id === ruleId)!;
      const rejected = result.state !== "VERIFIED" && Boolean(qualityCompletionBlock({ intent, trace: altered }));
      if (!rejected) throw new Error(`Quality mutation escaped: ${mutation}`);
      return { mutation, ruleId, expected: "Completion blocked", rejected, status: row.status, evidence: row.unresolvedReason };
    });
    await writeFile(join(output, "mutations.json"), JSON.stringify(mutations, null, 2));
    const measurement = { runId: run.id, projectId: project.id, threadId: run.threadId, database, durationMs: performance.now() - start,
      events: trace.events.length, traceBytes: Buffer.byteLength(JSON.stringify(trace)), cumulativeSnapshotBytes: snapshotBytes, modelCalls: 0, transportFixtureCalls: calls,
      verifierMs: trace.events.filter(event => event.stage === "verification").map(event => ({ id: event.verifierId, durationMs: event.durationMs })),
      status: report.state, acceptance: report.acceptance, limitation: "Deterministic worker transport; no live model or third-party CLI tested. Browser checks exercise the actual Books application." };
    repository.close(); repository = createWorkspaceRepository(database, projectRoot);
    const restored = repository.getRun(project.id, run.id)?.plan?.quality;
    if (JSON.stringify(restored) !== JSON.stringify(trace)) throw new Error("Trace did not survive SQLite reopen.");
    const reportStart = performance.now();
    if (JSON.stringify(readTaskQuality(database, run.id)) !== JSON.stringify(report)) throw new Error("Task report reconstruction changed after reopen.");
    const measured = { ...measurement, reportReconstructionMs: performance.now() - reportStart, output };
    await writeFile(join(output, "measurement.json"), JSON.stringify(measured, null, 2));
    return measured;
  } finally { repository.close(); }
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "../../../.."), project = join(root, "apps/engine-editor/website/examples/books");
  const manifest = process.argv[2];
  console.log(JSON.stringify(manifest ? await demonstrateRejectedProduction(root, resolve(manifest)) : await demonstrateQuality(project, join(root, ".local/quality-observability", crypto.randomUUID())), null, 2));
}

/** Replay a historical failed production at the actual Harness dispatch boundary. No rendering or source edits. */
async function demonstrateRejectedProduction(root: string, manifest: string) {
  if (manifest.includes('"')) throw Error("Unsupported quote in manifest path");
  const request = "Produce a coherent full music film with readable acting and musical progression";
  const ready: PlannerReadyTurn = { type: "ready", difficultyScore: 30, summary: request, executionModelId: "openai/fixture-worker", usesSubagents: false,
    subtasks: [], finalExecutionBrief: request, supervision: { request, intent: "Reduce owner direction", outcome: request,
      experience: "Understand the defining exchange and consequence", evidence: ["Production acceptance followed by full-speed sound-on review"],
      constraints: ["Original film and source music remain unchanged"], budget: "One acceptance replay; no full-song generation if it fails", decision: "continue", reason: "Failed historical performance must be resolved before expansion" },
    prerequisites: [{ id: "production", title: "Production acceptance", instruction: "Verify existing candidate", reason: "Reject known failure before expansion",
      requiredForTaskIds: [], owner: "main", status: "completed", verificationCommands: [`bun apps/engine-editor/scripts/music-video/recipes/cli.ts production-check "${manifest}"`] }], contracts: [] };
  let modelCalls = 0;
  const adapter: PiAgentAdapter = { setApiKey() {}, hasApiKey: () => true,
    async runPrompt() { modelCalls++; throw Error("Unexpected production dispatch"); },
    async startExecution() { modelCalls++; throw Error("Unexpected production dispatch"); } };
  let rejection = "";
  try { await executeReadyRun(adapter, { cwd: root, runId: "production-negative", sessionId: "production-negative", messages: [createChatMessage("user", request)],
    providerBrand: "gpt", readyPlan: ready, debugEnabled: false }); }
  catch (error) { rejection = String(error); }
  if (!rejection.includes("Verification failed") || modelCalls) throw Error(`Negative control failed: ${rejection}; model calls ${modelCalls}`);
  const receipt = { request, manifest, decision: "stop", modelCalls, rejection, outcome: "UNVERIFIED",
    demonstrated: "Current production validator ran before model dispatch and rejected expansion",
    limitation: "Historical external T3 shell caller is not intercepted; this replay uses the repository-owned Harness boundary. No new film or human-quality evidence." };
  const output = join(root, ".local/outcome-reconstruction", `production-${crypto.randomUUID()}.json`);
  await mkdir(join(root, ".local/outcome-reconstruction"), { recursive: true });
  await writeFile(output, JSON.stringify(receipt, null, 2));
  return { ...receipt, output };
}
