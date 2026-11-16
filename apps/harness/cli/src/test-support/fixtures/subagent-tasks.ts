
import type { PlannerSubtask } from "@hyperfocus/ai-core/protocol";
import type { PiAgentPromptRequest } from "../../pi-agent-adapter";
import { type TaskContractSettings } from "../../pi-orchestrator";
import { type SubagentResult } from "../../pi-subagents";

export function createScopedTask(id: string, ownedPaths: string[], exclusive: boolean = false): ScopedTask {
  return {
    task: {
      id,
      title: id,
      instruction: `run ${id}`
    },
    recoveryAttempt: 0,
    contractSettings: {
      ownedContracts: [],
      explicitOwnedPaths: ownedPaths,
      verificationCommands: [],
      exclusive
    }
  };
}

export function createResult(
  id: string,
  status: "completed" | "failed",
  attemptCount: number = 1,
  errorMessage?: string
): SubagentResult {
  return {
    id,
    title: id,
    instruction: `run ${id}`,
    status,
    output: status === "completed" ? `${id} done` : undefined,
    errorMessage,
    attemptCount,
    durationMs: 1
  };
}

export function pathForTest(id: string) {
  return `C:\\tmp\\${id}`;
}

export function promptRequest(prompt: string): PiAgentPromptRequest {
  return { kind: "planner", cwd: ".", modelId: "openai/test", prompt };
}

export type ScopedTask = {
  task: PlannerSubtask;
  contractSettings: TaskContractSettings;
  recoveryAttempt: number;
};

export function createSubtask(
  id: string,
  title: string,
  status: "pending" | "running" | "completed" | "failed"
) {
  return {
    id,
    title,
    instruction: `Handle ${title}`,
    status,
    attemptCount: 1,
    updatedAt: new Date().toISOString()
  };
}
