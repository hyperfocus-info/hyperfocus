import type { ProjectId, RunRuntimeBudget } from "@hyperfocus/ai-core/protocol";
import type {
  PiAgentAdapter,
  PiAgentExecutionController,
  PiAgentPromptRequest,
  PiAgentPromptResult,
  PiApiKeyProvider
} from "./pi-agent-adapter";
import type { WorkspaceRepository } from "./workspace-repository";

export function createRunBudgetAgentAdapter(
  inner: PiAgentAdapter,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  runId: string,
): PiAgentAdapter {
  function setApiKey(provider: PiApiKeyProvider, apiKey: string | undefined) {
    inner.setApiKey(provider, apiKey);
  }

  function hasApiKey(provider: PiApiKeyProvider) {
    return inner.hasApiKey(provider);
  }

  async function runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    const budget = repository.reserveAgentRunTurn(projectId, runId);
    return inner.runPrompt(withRuntimeBudgetPrompt(request, budget));
  }

  async function startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    const budget = repository.reserveAgentRunTurn(projectId, runId);
    const controller = await inner.startExecution(withRuntimeBudgetPrompt(request, budget));
    return createRunBudgetExecutionController(controller, repository, projectId, runId);
  }

  return { setApiKey, hasApiKey, runPrompt, startExecution };
}

function createRunBudgetExecutionController(
  inner: PiAgentExecutionController,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  runId: string,
): PiAgentExecutionController {
  function continueWithPrompt(prompt?: string) {
    const budget = repository.reserveAgentRunTurn(projectId, runId);
    return inner.continueWithPrompt(appendRuntimeBudgetSection(prompt ?? "continue", budget));
  }

  function abort() {
    return inner.abort();
  }

  function dispose() {
    inner.dispose();
  }

  return { result: inner.result, continueWithPrompt, abort, dispose };
}

function withRuntimeBudgetPrompt(request: PiAgentPromptRequest, budget: RunRuntimeBudget | undefined): PiAgentPromptRequest {
  return {
    ...request,
    prompt: appendRuntimeBudgetSection(request.prompt, budget)
  };
}

function appendRuntimeBudgetSection(prompt: string, budget: RunRuntimeBudget | undefined) {
  if (!budget) {
    return prompt;
  }

  return [
    prompt,
    "",
    "# Runtime Budget",
    `Turn limit: ${budget.maxTurns}`,
    `Current turn: ${budget.currentTurn}`,
    `Remaining turns after this: ${budget.remainingTurns}`,
    "If remaining turns are 0, finish now. Do not start new discovery, questions, or optional verification."
  ].join("\n");
}
