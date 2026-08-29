import { prepareGeminiCachedAttachmentContext } from "../../gemini-cached-contents";
import type { GeminiCachedAttachmentContext } from "../../gemini-cached-contents";
import type { PiAgentAdapter } from "../../pi-agent-adapter";
import { buildWorkspaceConfigHash } from "../../prompt-cache";
import type { PromptCacheIdentity } from "../../prompt-cache";
import { createRunBudgetAgentAdapter } from "../../run-budget-agent-adapter";
import type { PendingBrowserApproval } from "../core/contracts";
import type { WorkspaceRepository } from "../../workspace-repository";
import { claimBrowserApprovalWaitersForRun } from "./browser-approval-waiters";
import type { AgentRunState, ChatMessage, ModeDefinition, ProjectId, ProviderBrand, WorkspaceRuleSource } from "@hyperfocus/ai-core/protocol";
export { isTerminalAgentRunStatus as isTerminalRunStatus } from "@hyperfocus/ai-core/protocol";

export function createBrowserApprovalKey(projectId: ProjectId, runId: string, sessionId: string, toolCallId: string) {
  return JSON.stringify([projectId, runId, sessionId, toolCallId]);
}

export function browserApprovalKeyOwnsRun(key: string, projectId: ProjectId, runId: string) {
  try { const value: unknown = JSON.parse(key);
    return Array.isArray(value) && value.length === 4 && value[0] === projectId && value[1] === runId; }
  catch { return false; }
}

export function createRunBudgetAdapter(
  adapter: PiAgentAdapter,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  runId: string
) {
  return createRunBudgetAgentAdapter(adapter, repository, projectId, runId);
}

export function buildProjectPromptCacheIdentity(input: {
  repository: WorkspaceRepository;
  projectId: ProjectId;
  projectRootPath: string;
  providerBrand: ProviderBrand;
  selectedModeId?: string;
  mode?: ModeDefinition;
  ruleSources?: WorkspaceRuleSource[];
}): PromptCacheIdentity {
  return {
    projectId: input.projectId,
    workspaceConfigHash: buildWorkspaceConfigHash({
      projectId: input.projectId,
      projectRootPath: input.projectRootPath,
      providerBrand: input.providerBrand,
      selectedModeId: input.selectedModeId,
      mode: input.mode,
      ruleSources: input.ruleSources,
      memoryBankEnabledDefault: input.repository.getMemoryBankEnabledDefault()
    })
  };
}

export async function prepareRunGeminiAttachmentCache(input: {
  repository: WorkspaceRepository;
  projectId: ProjectId;
  modelId: string;
  messages: ChatMessage[];
  enabled?: boolean;
}): Promise<GeminiCachedAttachmentContext | undefined> {
  if (!input.enabled) {
    return undefined;
  }

  return prepareGeminiCachedAttachmentContext({
    repository: input.repository,
    projectId: input.projectId,
    modelId: input.modelId,
    messages: input.messages,
    googleApiKey: input.repository.getStoredGoogleApiKey()
  });
}

export function rejectPendingBrowserApprovalsForRun(
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  runId: string,
  reason: string,
  status: Extract<AgentRunState["status"], "completed" | "failed" | "partial-complete" | "stopped">,
  failureCategory?: AgentRunState["failureCategory"],
) {
  const project = repository.terminalizeAgentRun({ projectId, runId, status, reason, failureCategory });
  for (const approval of claimBrowserApprovalWaitersForRun(pendingBrowserApprovals, projectId, runId)) {
    approval.reject(new Error(reason));
  }
  return project;
}
