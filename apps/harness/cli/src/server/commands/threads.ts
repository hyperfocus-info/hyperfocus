import { debugLog } from "../../logging";
import type { ServerCommandContext } from "./context";
import { sendEvent } from "../transport/events";
import { emitProjectUpdated, emitRunUpdatedById, enrichProjectForComposer } from "../workspace/project-events";
import { isActiveThreadStreaming, requirePersistedThreadRun } from "../execution/state";
import { rejectPendingBrowserApprovalsForRun } from "../execution/run-context";
import { stopThreadActivityBeforeArchive } from "../workspace/operations";
import { scheduleBranchfsRetentionPrune } from "../workspace/branchfs-guards";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { emitNotificationsUpdatedToAll } from "../automation/background-events";

type ThreadsCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "cliSessionManager" | "emitSetupRefresh" | "pendingBrowserApprovals" | "connections">;

export async function handleThreadsCommand(command: ClientCommand, context: ThreadsCommandContext) {
  const { ws, runtime, repository, cliSessionManager, emitSetupRefresh, pendingBrowserApprovals, connections } = context;
  switch (command.type) {
case "thread.message": {
      repository.sendThreadMessage(command.payload);
      const project = repository.getProject(command.payload.projectId);
      runtime.upsertPersistedProject(project);
      emitProjectUpdated(ws, command.requestId, project.id, project, repository);
      return;
    }
case "thread.input": {
      const { projectId, threadId, message, deliveryId, mode } = command.payload;
      const project = repository.getProject(projectId);
      const thread = project.threads.find(entry => entry.id === threadId);
      if (!thread || thread.status === "archived") throw new Error("Choose an active project thread");
      if (mode === "steer") {
        const run = repository.getLatestThreadRun(projectId, threadId);
        const parentRunId = thread.lineage?.relationship === "subagent" ? thread.lineage.runId : run?.id;
        const execution = parentRunId ? runtime.getRunExecutionStates(projectId, parentRunId).find(entry =>
          thread.lineage?.relationship === "subagent" ? entry.subagentId === thread.lineage.subagentId : !entry.subagentId && entry.controller?.steer) : undefined;
        try {
          if (!execution?.controller?.steer) throw new Error("This runtime or phase cannot receive a message mid-turn. Queue it with Enter instead.");
          await execution.controller.steer(message);
        } catch (error) {
          sendEvent(ws, { type: "thread.inputRejected", requestId: command.requestId,
            payload: { projectId, threadId, deliveryId, reason: error instanceof Error ? error.message : String(error) } });
          return;
        }
        runtime.upsertPersistedProject(repository.appendMessage(projectId, "user", message, threadId));
      } else {
        repository.enqueueThreadMessage({ id: deliveryId, projectId, threadId, content: message });
        runtime.upsertPersistedProject(repository.getProject(projectId));
      }
      emitProjectUpdated(ws, command.requestId, projectId, repository.getProject(projectId), repository);
      sendEvent(ws, { type: "thread.inputAccepted", requestId: command.requestId,
        payload: { projectId, threadId, content: message, deliveryId, mode } });
      return;
    }
case "thread.create": {
      const nextProject = repository.createThread(command.payload.projectId);
      runtime.upsertPersistedProject(nextProject);
      runtime.clearProjectTransients(command.payload.projectId, nextProject.activeThreadId);
      sendEvent(ws, {
        type: "thread.created",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          project: enrichProjectForComposer(runtime.getProject(command.payload.projectId))
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
case "thread.activate": {
      const nextProject = repository.activateThread(command.payload.projectId, command.payload.threadId);
      runtime.upsertPersistedProject(nextProject);
      sendEvent(ws, {
        type: "thread.activated",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          project: enrichProjectForComposer(runtime.getProject(command.payload.projectId))
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
case "thread.fork": {
      const nextProject = repository.forkThread(command.payload.projectId, command.payload.sourceThreadId);
      runtime.upsertPersistedProject(nextProject);
      runtime.clearProjectTransients(command.payload.projectId, nextProject.activeThreadId);
      sendEvent(ws, {
        type: "thread.created",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          project: enrichProjectForComposer(runtime.getProject(command.payload.projectId))
        }
      });
      return;
    }
case "thread.rename": {
      const nextProject = repository.renameThread(command.payload.projectId, command.payload.threadId, command.payload.title);
      runtime.upsertPersistedProject(nextProject);
      const thread = nextProject.threads.find((entry) => entry.id === command.payload.threadId);
      if (!thread) {
        throw new Error(`Unknown thread: ${command.payload.threadId}`);
      }

      sendEvent(ws, {
        type: "thread.renamed",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          thread
        }
      });
      return;
    }
case "thread.pin": {
      const nextProject = repository.setThreadPinned(command.payload.projectId, command.payload.threadId, command.payload.pinned);
      runtime.upsertPersistedProject(nextProject);
      const thread = nextProject.threads.find((entry) => entry.id === command.payload.threadId);
      if (!thread) {
        throw new Error(`Unknown thread: ${command.payload.threadId}`);
      }

      sendEvent(ws, {
        type: "thread.pinned",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          thread
        }
      });
      return;
    }
case "thread.archive": {
      const archivedProject = repository.archiveThread(command.payload.projectId, command.payload.threadId);
      runtime.upsertPersistedProject(archivedProject);
      await stopThreadActivityBeforeArchive({
        ws,
        requestId: command.requestId,
        repository,
        runtime,
        cliSessionManager,
        pendingBrowserApprovals,
        connections,
        projectId: command.payload.projectId,
        threadId: command.payload.threadId
      });
      const nextProject = repository.getProject(command.payload.projectId);
      runtime.upsertPersistedProject(nextProject);
      emitProjectUpdated(ws, command.requestId, command.payload.projectId, nextProject, repository);
      return;
    }
case "thread.cleanupArchive": {
      const result = repository.cleanupArchiveThreads({
        projectIds: command.payload.projectIds?.length ? command.payload.projectIds : undefined,
        cutoffIso: new Date(Date.now() - command.payload.olderThanMs).toISOString()
      });
      for (const project of result.projects) {
        runtime.upsertPersistedProject(project.project);
      }
      sendEvent(ws, {
        type: "thread.cleanupArchived",
        requestId: command.requestId,
        payload: result
      });
      return;
    }
case "thread.restore": {
      const nextProject = repository.restoreThread(command.payload.projectId, command.payload.threadId);
      runtime.upsertPersistedProject(nextProject);
      emitProjectUpdated(ws, command.requestId, command.payload.projectId, nextProject, repository);
      return;
    }
case "session.reset": {
      const activeProject = runtime.getProject(command.payload.projectId);
      if (isActiveThreadStreaming(runtime, command.payload.projectId, activeProject.activeThreadId)) {
        throw new Error("Project is streaming");
      }

      const project = repository.resetProject(command.payload.projectId);
      runtime.upsertPersistedProject(project);
      runtime.clearProjectTransients(command.payload.projectId, project.activeThreadId);

      const nextProject = runtime.getProject(command.payload.projectId);
      sendEvent(ws, {
        type: "session.reset",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          threadId: nextProject.activeThreadId,
          sessionId: nextProject.session.sessionId,
          state: nextProject.session
        }
      });
      return;
    }
case "chat.stop": {
      requirePersistedThreadRun(
        repository,
        command.payload.projectId,
        command.payload.threadId,
        command.payload.runId
      );
      runtime.getAbortController(command.payload.projectId, command.payload.runId)?.abort();
      runtime.setProjectStreaming(command.payload.projectId, false, command.payload.threadId);
      runtime.clearStreaming(command.payload.projectId, command.payload.threadId);
      runtime.setProjectError(command.payload.projectId, "Chat request stopped by user", command.payload.threadId);

      const stoppedProject = rejectPendingBrowserApprovalsForRun(
        pendingBrowserApprovals,
        repository,
        command.payload.projectId,
        command.payload.runId,
        "Run stopped",
        "stopped"
      );
      runtime.upsertPersistedProject(stoppedProject);
      emitRunUpdatedById(ws, command.requestId, repository, command.payload.projectId, command.payload.runId);
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      scheduleBranchfsRetentionPrune(runtime.getProject(command.payload.projectId).rootPath);

      sendEvent(ws, {
        type: "chat.error",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          threadId: command.payload.threadId,
          message: "Chat request stopped by user"
        }
      });

      debugLog("chat.stop", {
        projectId: command.payload.projectId
      });
      return;
    }
    default:
      throw new Error(`Unsupported threads command: ${command.type}`);
  }
}
