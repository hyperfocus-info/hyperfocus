import { debugLog } from "../../logging";
import type { PiAgentExecutionEvent } from "../../pi-agent-adapter";
import type { WorkspaceRepository } from "../../workspace-repository";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

export type ToolArtifactIdentity = {
  projectId: string; runId: string; owner: "main" | "subagent" | "aggregator";
  subagentId?: string; toolCallId: string; kind: string;
};

export function writeToolDebugArtifactIfEnabled(
  repository: Pick<WorkspaceRepository, "getDebugEnabledDefault">,
  identity: ToolArtifactIdentity,
  value: unknown
) {
  if (!repository.getDebugEnabledDefault()) {
    return undefined;
  }
  if (value === undefined) {
    return undefined;
  }

  try {
    const artifactDir = path.resolve(process.cwd(), ".local", "debug", "tool-artifacts",
      identityDigest([identity.projectId]), identityDigest([identity.projectId, identity.runId]));
    mkdirSync(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, `${identityDigest([identity.projectId, identity.runId,
      identity.owner, identity.subagentId ?? null, identity.toolCallId, identity.kind])}.json`);
    atomicWriteArtifact(artifactPath, stableDebugJson(value));
    return artifactPath;
  } catch (error) {
    debugLog("tool.debugArtifact.writeFailed", {
      runId: identity.runId,
      toolCallId: identity.toolCallId,
      kind: identity.kind,
      error: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
}

function identityDigest(parts: readonly unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
function atomicWriteArtifact(artifactPath: string, content: string) {
  const temporaryPath = `${artifactPath}.${randomUUID()}.tmp`;
  try { writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx" }); renameSync(temporaryPath, artifactPath); }
  finally { rmSync(temporaryPath, { force: true }); }
}

export function stableDebugJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return JSON.stringify({ unserializable: String(value) }, null, 2);
  }
}
export function logToolFailure(
  runId: string,
  owner: "main" | "subagent" | "aggregator",
  subagentId: string | undefined,
  event: Extract<PiAgentExecutionEvent, { type: "tool-end" }>
) {
  const result = parseToolFailureResult(event.result);
  debugLog("agent.tool.failed", {
    runId,
    owner,
    subagentId,
    toolName: event.toolName,
    command: result.command,
    exitCode: result.exitCode,
    status: result.status,
    outputPreview: result.outputPreview
  });
}

export function parseToolFailureResult(result: unknown) {
  if (!result || typeof result !== "object") {
    return {
      command: undefined,
      exitCode: undefined,
      status: undefined,
      outputPreview: summarizeToolOutput(result)
    };
  }

  const read = (key: string): unknown => Reflect.get(result, key);
  const command = read("command");
  const exitCode = read("exitCode");
  const snakeCaseExitCode = read("exit_code");
  const status = read("status");
  return {
    command: typeof command === "string" ? command.slice(0, 500) : undefined,
    exitCode: typeof exitCode === "number" ? exitCode : typeof snakeCaseExitCode === "number" ? snakeCaseExitCode : undefined,
    status: typeof status === "string" ? status.slice(0, 80) : undefined,
    outputPreview: summarizeToolOutput(read("output") ?? read("aggregated_output") ?? read("stderr") ?? read("error"))
  };
}

export function summarizeToolOutput(value: unknown) {
  if (typeof value === "string") {
    return value.replace(/\s+/g, " ").trim().slice(0, 500) || undefined;
  }

  if (value === undefined || value === null) {
    return undefined;
  }

  return JSON.stringify(value).replace(/\s+/g, " ").trim().slice(0, 500);
}
