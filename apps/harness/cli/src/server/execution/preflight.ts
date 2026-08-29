import type { ManagedExecutionState } from "../../execution-runtime";
import type { HarnessConnection, HarnessServerOsAdapters, ProjectLike } from "../core/contracts";
import { sendEvent } from "../transport/events";
import { appendSystemStatus } from "./transcript-state";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { ChatAttachment, ProjectId, ThreadId } from "@hyperfocus/ai-core/protocol";

export function isExecutionBusy(state: ManagedExecutionState) {
  return state.phase === "active" || state.phase === "finishing";
}

export async function enforceExecutionPreflight(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  project: ProjectLike,
  osAdapters: HarnessServerOsAdapters
) {
  const maxDirtyFileCount = repository.getDirtyGitChangeLimitDefault();
  const result = await osAdapters.runGitPreflight(project.rootPath, {
    enabled: repository.getBlockChatOnDirtyGitDefault(),
    maxDirtyFileCount
  });
  if (result.status === "warning") {
    appendSystemStatus(ws, requestId, runtime, repository, project.id, project.activeThreadId, result.preflight.message);
    sendEvent(ws, {
      type: "run.preflight",
      requestId,
      payload: {
        projectId: project.id,
        threadId: project.activeThreadId,
        preflight: result.preflight
      }
    });
    return;
  }

  if (result.status === "blocked") {
    if (result.preflight.kind === "git-not-repo") {
      appendSystemStatus(ws, requestId, runtime, repository, project.id, project.activeThreadId, result.preflight.message);
      sendEvent(ws, {
        type: "run.preflight",
        requestId,
        payload: {
          projectId: project.id,
          threadId: project.activeThreadId,
          preflight: result.preflight
        }
      });
      throw createPreflightDecisionRequiredError(result.preflight.message);
    }
    throw new Error(`Git dirty: ${result.changedFileCount} changed files. Refusing run above ${maxDirtyFileCount} files.`);
  }
}

export function createPreflightDecisionRequiredError(message: string) {
  const error = new Error(message);
  error.name = "PreflightDecisionRequiredError";
  return error;
}

export function isPreflightDecisionRequiredError(error: unknown) {
  return error instanceof Error && error.name === "PreflightDecisionRequiredError";
}

export function validatePromptAttachments(
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: ThreadId,
  attachments?: ChatAttachment[]
) {
  if (!attachments?.length) {
    return undefined;
  }

  return attachments.map((attachment) => {
    const upload = repository.getChatAttachmentUpload(attachment.key);
    if (!upload) {
      throw new Error(`Attachment is not available from a trusted upload: ${attachment.name}`);
    }
    if (upload.projectId && upload.projectId !== projectId) {
      throw new Error(`Attachment ${attachment.name} belongs to another project`);
    }
    if (upload.threadId && upload.threadId !== threadId) {
      throw new Error(`Attachment ${attachment.name} belongs to another thread`);
    }
    const trusted = upload.attachment;
    if (
      trusted.url !== attachment.url ||
      trusted.kind !== attachment.kind ||
      trusted.name !== attachment.name ||
      trusted.mimeType !== attachment.mimeType ||
      trusted.sizeBytes !== attachment.sizeBytes
    ) {
      throw new Error(`Attachment metadata changed after upload: ${attachment.name}`);
    }
    if (trusted.documentType !== attachment.documentType) {
      throw new Error(`Attachment document metadata changed after upload: ${attachment.name}`);
    }

    return trusted;
  });
}

export function appendCapturedCliContext(
  content: string,
  context: ReturnType<WorkspaceRuntimeStore["consumeThreadCapturedCliContext"]>
) {
  if (!context) {
    return content;
  }

  return [
    content,
    "",
    "[Captured CLI session context]",
    `Session: ${context.sessionId}`,
    `Captured at: ${context.capturedAt}`,
    context.visibleBuffer ? ["Visible stdout:", context.visibleBuffer].join("\n") : undefined,
    context.stderrTail ? ["Stderr tail:", context.stderrTail].join("\n") : undefined
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
