import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createAssistantId, type AgentRuntimeCapability } from "@hyperfocus/ai-core/protocol";
import type { AgentRuntime } from "../agent-runtimes/agent-runtime";
import { createAgentRuntimeRegistry } from "../agent-runtimes/runtime-registry";
import { createAssistantManager } from "../assistant-manager";
import type { PiAgentAdapter } from "../pi-agent-adapter";
import { resolveHarnessTestTempRoot } from "../test-support/test-temp-root";
import { createWorkspaceRepository } from "../workspace-repository";

test("shutdown rejects maintenance admitted by a command finishing after begin", async () => {
  const root = path.join(resolveHarnessTestTempRoot(), `shutdown-${crypto.randomUUID()}`); mkdirSync(root, { recursive: true });
  const repository = createWorkspaceRepository(":memory:", root, { durability: "test-fast" });
  const project = repository.addProject(root), now = new Date().toISOString();
  const assistant = repository.saveAssistant({ id: createAssistantId(), name: "Shutdown", scope: "project",
    projectId: project.id, personalityPrompt: "Direct", jobPrompt: "Test", agentId: "pi", runState: "active",
    bootstrapState: "completed", failureStreakCount: 0, circuitBreakerState: "closed", unreadQuestionCount: 0,
    createdAt: now, updatedAt: now });
  const calls: string[] = []; let runtimeResolutions = 0;
  const adapter: PiAgentAdapter = { async runPrompt() { calls.push("prompt"); return { text: "{}" }; },
    async startExecution() { throw new Error("not used"); }, setApiKey() {}, hasApiKey() { return true; } };
  const capability: AgentRuntimeCapability = { agentId: "pi", label: "Pi", runtimeKind: "sdk", installed: true,
    authenticated: true, supportsProgrammatic: true, supportsInteractive: false, interactivePipeCompatible: false,
    supportsPlanning: true, supportsReview: true, supportsReasoningStrengthControl: false, supportsFastModeControl: true,
    discoveredModels: ["openai/gpt-5.4"], modelDiscoveryConfidence: "exact" };
  const runtime: AgentRuntime = { id: "pi", label: "Pi", getAdapter: () => adapter,
    getCapability: () => { runtimeResolutions += 1; return capability; },
    refreshCapability: async () => capability, getDefaultPlanningModelId: () => "openai/gpt-5.4",
    getDefaultExecutionModelId: () => "openai/gpt-5.4", getDefaultSubagentModelId: () => "openai/gpt-5.4" };
  let releaseAppend: () => void = () => undefined, observeAppend: () => void = () => undefined;
  const appendBlocked = new Promise<void>((resolve) => { releaseAppend = resolve; });
  const appendStarted = new Promise<void>((resolve) => { observeAppend = resolve; });
  const manager = createAssistantManager(repository, createAgentRuntimeRegistry([runtime]), {
    onAssistantsUpdated() {}, onAssistantDetailsChanged() {}, onAssistantChatDelta() {},
    async onAssistantChatMessageAppended() { observeAppend(); await appendBlocked; }, onAssistantChatComplete() {}, onAssistantChatFailed() {},
    onAssistantLogAppended() {}, onAssistantCreatedCard() {} }, { reprioritizeDebounceMs: 0 });
  const chat = manager.sendAssistantChat(assistant.id, "blocked shutdown chat"); await appendStarted;
  manager.beginShutdown(); manager.scheduleReprioritize(assistant.id, "late-command");
  manager.queueAssistantBootstrap(assistant.id, { force: true });
  let settled = false; const settling = manager.settleShutdown().then(() => { settled = true; });
  await Promise.resolve(); expect(settled).toBe(false); releaseAppend(); await settling; await chat; repository.close();
  await new Promise((resolve) => setTimeout(resolve, 20)); expect({ calls, runtimeResolutions }).toEqual({ calls: [], runtimeResolutions: 0 });
});
