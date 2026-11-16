import { runManagedAgentExecution } from "../../managed-agent-execution";
import type { PiAgentAdapter, PiAgentExecutionEvent } from "../../pi-agent-adapter";
import type { SubagentResult } from "../../pi-subagents";
import { createMilestoneDeltaParser, extractMilestoneLines, stripMilestoneLines } from "../../run-milestone-windows";
import type { createExecutionCallbacks } from "./callbacks";
import { isTransientSubagentError } from "./subagent-errors";
import { resolveSubagentModelId, resolveSubagentReasoningStrength } from "../../subagent-defaults";
import { SUBAGENT_MILESTONE_INSTRUCTION, buildSubagentEnvironmentBrief, discoverRepoSkillPaths, resolveRepoRoot } from "../../subagent-environment";
import type { ComposerReasoningStrength, PlannerReadyTurn, ProviderBrand, RunModelPreference } from "@hyperfocus/ai-core/protocol";

type InlineSubagentRetryOptions = {
  runId: string;
  cwd: string;
  agentId: "pi" | "copilot-cli" | "codex-cli";
  providerBrand: ProviderBrand;
  executionModelId: string;
  modelPreference?: RunModelPreference;
  task: PlannerReadyTurn["subtasks"][number];
  brief: string;
  priorAttemptCount: number;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
  abortSignal: AbortSignal;
  callbacks: ReturnType<typeof createExecutionCallbacks>;
  sessionId: string;
};

export async function runInlineSubagentRetry(adapter: PiAgentAdapter, options: InlineSubagentRetryOptions): Promise<SubagentResult> {
  const subagentModelId = resolveSubagentModelId({
    agentId: options.agentId,
    providerBrand: options.providerBrand,
    executionModelId: options.executionModelId,
    modelPreference: options.modelPreference
  });
  const subagentReasoningStrength = resolveSubagentReasoningStrength(options.reasoningStrength, options.modelPreference);
  const repoRoot = resolveRepoRoot(options.cwd);
  const subagentEnvironmentBrief = buildSubagentEnvironmentBrief({
    projectRoot: options.cwd,
    repoRoot,
    availableSkillPaths: discoverRepoSkillPaths(repoRoot)
  });
  let attempt = 0;

  while (true) {
    attempt += 1;
    const startedAt = Date.now();
    try {
      const basePrompt = [
        "You are a focused coding subagent.",
        "Complete only the assigned instruction.",
        "Return concise, implementation-focused output.",
        SUBAGENT_MILESTONE_INSTRUCTION,
        subagentEnvironmentBrief,
        "",
        `Shared brief: ${options.brief}`,
        `Subtask title: ${options.task.title}`,
        `Subtask instruction: ${options.task.instruction}`
      ].join("\n");
      const milestoneParser = createMilestoneDeltaParser((line) =>
        options.callbacks.onRunMilestone?.(`Subagent ${options.task.title}: ${line}`)
      );
      const response = await runManagedAgentExecution(adapter, {
        runId: options.runId,
        kind: "subagent",
        subagentId: options.task.id,
        originalRequest: {
          threadTools: options.callbacks.threadTools(options.task.id),
          kind: "subagent",
          cwd: options.cwd,
          modelId: subagentModelId,
          prompt: basePrompt,
          reasoningStrength: subagentReasoningStrength,
          fastMode: options.fastMode,
          onTextDelta(delta: string) {
            milestoneParser.push(delta);
          },
          onExecutionEvent(event: PiAgentExecutionEvent) {
            void options.callbacks.onExecutionEvent?.({
              owner: "subagent",
              subagentId: options.task.id,
              event
            });
          },
          requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
            return options.callbacks.requestBrowserApproval?.({
              owner: "subagent",
              subagentId: options.task.id,
              ...input
            }) ?? Promise.resolve({ approved: true });
          }
        },
        continuationRequest: {
          threadTools: options.callbacks.threadTools(options.task.id),
          kind: "subagent",
          cwd: options.cwd,
          modelId: subagentModelId,
          prompt: ["continue", "", basePrompt].join("\n"),
          reasoningStrength: subagentReasoningStrength,
          fastMode: options.fastMode,
          onTextDelta(delta: string) {
            milestoneParser.push(delta);
          },
          onExecutionEvent(event: PiAgentExecutionEvent) {
            void options.callbacks.onExecutionEvent?.({
              owner: "subagent",
              subagentId: options.task.id,
              event
            });
          },
          requestBrowserApproval(input: { toolCallId: string; toolName: string; args: unknown }) {
            return options.callbacks.requestBrowserApproval?.({
              owner: "subagent",
              subagentId: options.task.id,
              ...input
            }) ?? Promise.resolve({ approved: true });
          }
        },
        abortSignal: options.abortSignal,
        store: {
          getState: () =>
            options.callbacks.getExecutionState?.({
              runId: options.runId,
              kind: "subagent",
              subagentId: options.task.id
            }),
          setState: (state) => options.callbacks.setExecutionState?.(state),
          clearState: () =>
            options.callbacks.clearExecutionState?.({
              runId: options.runId,
              kind: "subagent",
              subagentId: options.task.id
            })
        },
        onRefreshComplete(mode) {
          options.callbacks.onTrace?.({
            sessionId: options.sessionId,
            stage: "refresh-complete",
            message: `Refresh complete for ${options.task.title} (${mode})`,
            subagentId: options.task.id,
            modelId: subagentModelId
          });
        }
      });
      milestoneParser.flush();
      if (!milestoneParser.hasEmitted()) {
        for (const line of extractMilestoneLines(response.text)) {
          options.callbacks.onRunMilestone?.(`Subagent ${options.task.title}: ${line}`);
        }
      }
      const output = stripMilestoneLines(response.text);
      if (response.contextUsage) {
        options.callbacks.onContextUsage?.({
          sourceKind: "subagent",
          sourceLabel: options.task.id,
          modelId: subagentModelId,
          tokens: response.contextUsage.tokens,
          inputTokens: Math.max(0, response.contextUsage.sessionStats.tokens.total - response.contextUsage.sessionStats.tokens.output),
          contextWindow: response.contextUsage.contextWindow,
          usagePercent: response.contextUsage.usagePercent,
          totalProcessedTokens: response.contextUsage.sessionStats.tokens.total,
          cachedInputTokens: response.contextUsage.cachedInputTokens,
          updatedAt: new Date().toISOString()
        });
      }

      options.callbacks.onTrace?.({
        sessionId: options.sessionId,
        stage: "subagent-complete",
        message: `Completed ${options.task.title}`,
        detail: output.slice(0, 240),
        subagentId: options.task.id,
        modelId: subagentModelId,
        durationMs: Date.now() - startedAt
      });

      return {
        id: options.task.id,
        title: options.task.title,
        instruction: options.task.instruction,
        status: "completed",
        output,
        mountPath: options.cwd,
        attemptCount: options.priorAttemptCount + attempt,
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error("Unknown subagent failure");
      if (options.abortSignal.aborted) {
        throw typedError;
      }

      if (attempt === 1 && isTransientSubagentError(typedError)) {
        options.callbacks.onSubagentRetry?.(options.task, options.priorAttemptCount + attempt + 1, typedError);
        options.callbacks.onTrace?.({
          sessionId: options.sessionId,
          stage: "subagent-retry",
          message: `Retrying ${options.task.title}`,
          detail: `Attempt ${options.priorAttemptCount + attempt + 1}: ${typedError.message}`,
          subagentId: options.task.id,
          modelId: subagentModelId
        });
        continue;
      }

      options.callbacks.onTrace?.({
        sessionId: options.sessionId,
        stage: "subagent-error",
        message: `Failed ${options.task.title}`,
        detail: typedError.message,
        subagentId: options.task.id,
        modelId: subagentModelId
      });

      return {
        id: options.task.id,
        title: options.task.title,
        instruction: options.task.instruction,
        status: "failed",
        errorMessage: typedError.message,
        mountPath: options.cwd,
        attemptCount: options.priorAttemptCount + attempt,
        durationMs: Date.now() - startedAt
      };
    }
  }
}
