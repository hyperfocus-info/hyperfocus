import type { HarnessConnection } from "../core/contracts";
import { emitThreadMessageAppended, findLatestNonMilestoneAssistantMessage, getThreadSessionState } from "../workspace/project-events";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { ChatMessage, ProjectId, ThreadId } from "@hyperfocus/ai-core/protocol";

export function hasPersistedFinalAssistantContent(
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: ThreadId,
  expectedContent: string
) {
  const messages = repository.getThreadMessages(projectId, threadId);
  const latestNonMilestoneAssistant = findLatestNonMilestoneAssistantMessage(messages);
  if (!latestNonMilestoneAssistant) {
    return false;
  }

  const latestMilestoneIndex = findLastMessageIndex(messages, (message) => message.kind === "run-milestones");
  const latestAssistantIndex = findLastMessageIndex(messages, (message) => message.id === latestNonMilestoneAssistant.id);
  if (latestMilestoneIndex > latestAssistantIndex) {
    return false;
  }

  return normalizeAssistantContent(latestNonMilestoneAssistant.content) === normalizeAssistantContent(expectedContent);
}

export function normalizeAssistantContent(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

export function findLastMessageIndex(messages: ChatMessage[], predicate: (message: ChatMessage) => boolean) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && predicate(message)) {
      return index;
    }
  }

  return -1;
}

export function appendSystemStatus(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string,
  content: string
) {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    return;
  }

  const session = getThreadSessionState(runtime, repository, projectId, threadId);
  const lastMessage = session.messages.at(-1);
  if (lastMessage?.role === "system" && lastMessage.content === normalizedContent) {
    return;
  }

  const nextProject = repository.appendMessage(projectId, "system", normalizedContent, threadId);
  runtime.upsertPersistedProject(nextProject);
  emitThreadMessageAppended(ws, requestId, runtime, repository, projectId, threadId);
}

export function appendComposerControlStatus(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  projectId: ProjectId,
  threadId: string,
  fastMode?: boolean
) {
  if (!fastMode) {
    return;
  }

  appendSystemStatus(ws, requestId, runtime, repository, projectId, threadId, "Fast mode enabled.");
}
