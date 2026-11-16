import { ensureProjectDirectory, initializeGitBaseline } from "../../git-project";
import { createIdeProjectService } from "../../ide-project-service";
import { discardAssistantChatPumps, emitAssistantsUpdatedToAll } from "../automation/assistant-actions";
import { commitProjectDeletion } from "../automation/background-run-cancellation";
import { emitBackgroundJobsDeletedToAll, emitBackgroundJobsUpdatedToAll, emitNotificationsUpdatedToAll } from "../automation/background-events";
import type { ServerCommandContext } from "./context";
import { emitControlEvent, sendEvent } from "../transport/events";
import { discoverComposerFilePaths, discoverSkillPathsForProjectRoot, emitProjectUpdated, loadBoundedProjectState } from "../workspace/project-events";
import { findProjectForegroundRunWithStatuses } from "../execution/state";
import { isAbortError } from "../runtime/error-classification";
import { sendCommandRejected } from "../transport/command-rejection";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { listWorkspaceProjectFilePaths } from "../workspace/workspace-bootstrap";
import { fitBoundedPage } from "../transport/bounded-page";
import { SERVER_EVENT_EMIT_MAX_BYTES } from "@hyperfocus/ai-core/protocol";

type ProjectsCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "assistantManager" | "pickFolder" | "emitSetupRefresh" | "connections" | "backgroundRunControllers" | "projectSearchControllers" | "ideSearchControllers" | "osAdapters">;

const PROJECTS_PRIMARY_TYPES: ReadonlySet<ClientCommand["type"]> = new Set(["project.add", "project.create", "project.git.initBaseline", "project.browse", "project.remove", "project.activate", "project.search"]);

export async function handleProjectsCommand(command: ClientCommand, context: ProjectsCommandContext) {
  return PROJECTS_PRIMARY_TYPES.has(command.type)
    ? handleProjectsPrimary(command, context)
    : handleProjectsSecondary(command, context);
}

async function handleProjectsPrimary(command: ClientCommand, context: ProjectsCommandContext) {
  const { ws, runtime, repository, assistantManager, pickFolder, emitSetupRefresh, connections, backgroundRunControllers, projectSearchControllers, osAdapters } = context;
  switch (command.type) {
case "project.add": {
      const result = repository.openProject(command.payload.rootPath);
      runtime.upsertPersistedProject(result.project);
      runtime.setActiveProject(result.project.id);
      sendEvent(ws, {
        type: "project.opened",
        requestId: command.requestId,
        payload: {
          project: loadBoundedProjectState(repository, runtime.getProject(result.project.id)),
          activeProjectId: runtime.getWorkspace().activeProjectId!,
          availableSkillPaths: discoverSkillPathsForProjectRoot(result.project.rootPath),
          resolution: result.resolution
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
case "project.create": {
      const rootPath = await ensureProjectDirectory(command.payload.rootPath);
      const result = repository.openProject(rootPath);
      runtime.upsertPersistedProject(result.project);
      runtime.setActiveProject(result.project.id);
      sendEvent(ws, {
        type: "project.opened",
        requestId: command.requestId,
        payload: {
          project: loadBoundedProjectState(repository, runtime.getProject(result.project.id)),
          activeProjectId: runtime.getWorkspace().activeProjectId!,
          availableSkillPaths: discoverSkillPathsForProjectRoot(result.project.rootPath),
          resolution: result.resolution
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
case "project.git.initBaseline": {
      const project = runtime.getProject(command.payload.projectId);
      const result = await initializeGitBaseline(project.rootPath);
      sendEvent(ws, {
        type: "project.git.initialized",
        requestId: command.requestId,
        payload: {
          projectId: project.id,
          rootPath: project.rootPath,
          initialized: result.initialized,
          baselineCommitCreated: result.baselineCommitCreated
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
case "project.browse": {
      const selectedPath = await pickFolder();
      if (!selectedPath) {
        return;
      }

      const result = repository.openProject(selectedPath);
      runtime.upsertPersistedProject(result.project);
      runtime.setActiveProject(result.project.id);
      sendEvent(ws, {
        type: "project.opened",
        requestId: command.requestId,
        payload: {
          project: loadBoundedProjectState(repository, runtime.getProject(result.project.id)),
          activeProjectId: runtime.getWorkspace().activeProjectId!,
          availableSkillPaths: discoverSkillPathsForProjectRoot(result.project.rootPath),
          resolution: result.resolution
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
case "project.remove": {
      const blockingForegroundRun = findProjectForegroundRunWithStatuses(
        repository,
        command.payload.projectId,
        new Set(["planning", "awaiting-user-input", "running-main", "running-subagents", "aggregating"])
      );
      if (runtime.hasAnyStreamingThread(command.payload.projectId) || blockingForegroundRun) {
        throw new Error("Project is streaming");
      }

      const { activeProjectId, deletedJobIds, deletedAssistantIds } = await commitProjectDeletion({ repository, runtime,
        backgroundRunControllers, projectId: command.payload.projectId, afterCommit: (assistantIds) => {
          for (const assistantId of assistantIds) {
            assistantManager.invalidateAssistant(assistantId);
            discardAssistantChatPumps(assistantId);
          }
        } });
      emitBackgroundJobsDeletedToAll(connections, command.requestId,
        [{ kind: "project", projectId: command.payload.projectId }], deletedJobIds);
      emitControlEvent(connections, { type: "project.removed", requestId: command.requestId,
        payload: { projectId: command.payload.projectId, activeProjectId } });
      emitAssistantsUpdatedToAll(connections, repository.loadAssistantSummaryDelta([]), deletedAssistantIds);
      emitBackgroundJobsUpdatedToAll(connections, repository.loadBackgroundJobsState());
      emitNotificationsUpdatedToAll(connections, command.requestId, repository.loadNotificationInboxState());
      return;
    }
case "project.activate": {
      repository.activateProject(command.payload.projectId);
      runtime.setActiveProject(command.payload.projectId);
      const project = runtime.getProject(command.payload.projectId);
      // Catalog entries are summary shells. Activating one must also hydrate its
      // run projection so detail requests can restore questions and execution state.
      emitProjectUpdated(ws, command.requestId, project.id, project, repository);
      sendEvent(ws, {
        type: "project.activated",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          availableSkillPaths: discoverSkillPathsForProjectRoot(project.rootPath)
        }
      });
      await emitSetupRefresh(command.requestId);
      return;
    }
case "project.search": {
      projectSearchControllers.get(ws.data.clientId)?.abortController.abort();
      const abortController = new AbortController();
      projectSearchControllers.set(ws.data.clientId, {
        requestId: command.requestId,
        abortController
      });
      try {
        const results = await osAdapters.searchProjectFolders({
          query: command.payload.query,
          workspaceProjectPaths: runtime.getWorkspace().projects.map((project) => project.rootPath),
          signal: abortController.signal
        });
        const latestSearch = projectSearchControllers.get(ws.data.clientId);
        if (latestSearch?.requestId !== command.requestId || abortController.signal.aborted) {
          return;
        }
        sendEvent(ws, {
          type: "project.search.results",
          requestId: command.requestId,
          payload: {
            query: command.payload.query,
            results
          }
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        sendCommandRejected(
          ws,
          "Project search failed",
          error instanceof Error ? error.message : "Unknown project search error"
        );
      } finally {
        const latestSearch = projectSearchControllers.get(ws.data.clientId);
        if (latestSearch?.requestId === command.requestId) {
          projectSearchControllers.delete(ws.data.clientId);
        }
      }
      return;
    }
default:
      throw new Error(`Unsupported projects command: ${command.type}`);
  }
}

async function handleProjectsSecondary(command: ClientCommand, context: ProjectsCommandContext) {
  const { ws, runtime, ideSearchControllers } = context;
  switch (command.type) {
case "workspace.projects.list": {
      const projects = fitBoundedPage((limit) => context.repository.listWorkspaceProjects({ cursor: command.payload.cursor, limit }),
        command.payload.limit ?? 64, (page) => ({ type: "workspace.projects.listed", requestId: command.requestId,
          payload: { projects: page } }));
      sendEvent(ws, { type: "workspace.projects.listed", requestId: command.requestId,
        payload: { projects } });
      return;
    }
case "workspace.projectChildren.list": {
      const project = context.repository.getWorkspaceProjectCatalogEntry(command.payload.projectId);
      if (!project) throw Object.assign(new Error("Unknown project"), { code: "invalid-cursor" });
      const collectionCount = [command.payload.threads, command.payload.messages, command.payload.runSummaries,
        command.payload.filePaths].filter(Boolean).length;
      const collections = (["filePaths", "threads", "messages", "runSummaries"] as const).filter((key) => command.payload[key]);
      const budget = Math.floor((SERVER_EVENT_EMIT_MAX_BYTES - 16384) / collectionCount);
      const threads = command.payload.threads ? fitBoundedPage((limit) => context.repository.listWorkspaceProjectThreads(project.id,
        { cursor: command.payload.threads!.cursor, limit }), command.payload.threads.limit ?? 128, (page) => ({ threads: page }), budget) : undefined;
      const messages = command.payload.messages ? { threadId: command.payload.messages.threadId,
        page: fitBoundedPage((limit) => context.repository.listWorkspaceThreadMessages(project.id, command.payload.messages!.threadId,
          { cursor: command.payload.messages!.cursor, limit }), command.payload.messages.limit ?? 16,
        (page) => ({ messages: page }), budget) } : undefined;
      const runSummaries = command.payload.runSummaries ? { threadId: command.payload.runSummaries.threadId,
        page: fitBoundedPage((limit) => context.repository.listWorkspaceThreadRunSummaries(project.id,
          command.payload.runSummaries!.threadId, { cursor: command.payload.runSummaries!.cursor, limit }),
        command.payload.runSummaries.limit ?? 64, (page) => ({ runSummaries: page }), budget) } : undefined;
      let fileLimit = command.payload.filePaths?.limit ?? 128;
      const loadFiles = () => listWorkspaceProjectFilePaths({ ...project, filePaths: discoverComposerFilePaths(project.rootPath) },
        { ...command.payload.filePaths, limit: fileLimit });
      let filePaths = command.payload.filePaths ? loadFiles() : undefined;
      while (filePaths && new TextEncoder().encode(JSON.stringify({ filePaths })).byteLength > budget && fileLimit > 1) {
        fileLimit = Math.max(1, Math.floor(fileLimit / 2)); filePaths = loadFiles();
      }
      sendEvent(ws, { type: "workspace.projectChildren.listed", requestId: command.requestId,
        payload: { projectId: project.id, collections, threads, messages, runSummaries, filePaths } });
      return;
    }
case "ide.fileTree.list": {
      const project = runtime.getProject(command.payload.projectId);
      const service = createIdeProjectService();
      try {
        const result = await service.listFileTree({
          projectRoot: project.rootPath,
          rootPath: command.payload.rootPath,
          maxEntries: command.payload.maxEntries,
          includeIgnored: command.payload.includeIgnored
        });
        sendEvent(ws, {
          type: "ide.fileTree.listed",
          requestId: command.requestId,
          payload: {
            projectId: project.id,
            requestedPath: command.payload.rootPath,
            rootPath: result.rootPath,
            entries: result.entries,
            truncated: result.truncated
          }
        });
      } catch (error) {
        sendCommandRejected(ws, "IDE file tree failed", error instanceof Error ? error.message : "Unknown IDE file tree error", command.requestId);
      }
      return;
    }
case "ide.file.read": {
      const project = runtime.getProject(command.payload.projectId);
      const service = createIdeProjectService();
      try {
        const file = await service.readFile({
          projectId: project.id,
          projectRoot: project.rootPath,
          filePath: command.payload.path,
          maxBytes: command.payload.maxBytes
        });
        sendEvent(ws, {
          type: "ide.file.read",
          requestId: command.requestId,
          payload: file
        });
      } catch (error) {
        sendCommandRejected(ws, "IDE file read failed", error instanceof Error ? error.message : "Unknown IDE file read error", command.requestId);
      }
      return;
    }
case "ide.file.write": {
      const project = runtime.getProject(command.payload.projectId);
      const service = createIdeProjectService();
      try {
        const file = await service.writeFile({
          projectId: project.id,
          projectRoot: project.rootPath,
          filePath: command.payload.path,
          content: command.payload.content
        });
        sendEvent(ws, {
          type: "ide.file.written",
          requestId: command.requestId,
          payload: file
        });
      } catch (error) {
        sendCommandRejected(ws, "IDE file write failed", error instanceof Error ? error.message : "Unknown IDE file write error", command.requestId);
      }
      return;
    }
case "ide.search.run": {
      const project = runtime.getProject(command.payload.projectId);
      ideSearchControllers.get(ws.data.clientId)?.abortController.abort();
      const abortController = new AbortController();
      ideSearchControllers.set(ws.data.clientId, {
        requestId: command.requestId,
        abortController
      });
      try {
        const service = createIdeProjectService();
        const result = await service.searchProject({
          projectRoot: project.rootPath,
          query: command.payload.query,
          regex: command.payload.regex,
          caseSensitive: command.payload.caseSensitive,
          wholeWord: command.payload.wholeWord,
          includeGlob: command.payload.includeGlob,
          excludeGlob: command.payload.excludeGlob,
          maxResults: command.payload.maxResults,
          signal: abortController.signal
        });
        const latestSearch = ideSearchControllers.get(ws.data.clientId);
        if (latestSearch?.requestId !== command.requestId || abortController.signal.aborted) {
          return;
        }
        sendEvent(ws, {
          type: "ide.search.results",
          requestId: command.requestId,
          payload: {
            projectId: project.id,
            query: command.payload.query,
            results: result.results,
            truncated: result.truncated
          }
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        sendCommandRejected(ws, "IDE search failed", error instanceof Error ? error.message : "Unknown IDE search error", command.requestId);
      } finally {
        const latestSearch = ideSearchControllers.get(ws.data.clientId);
        if (latestSearch?.requestId === command.requestId) {
          ideSearchControllers.delete(ws.data.clientId);
        }
      }
      return;
    }
case "ide.search.cancel": {
      const controller = ideSearchControllers.get(ws.data.clientId);
      if (controller?.requestId === command.payload.searchRequestId) {
        controller.abortController.abort();
        ideSearchControllers.delete(ws.data.clientId);
      }
      sendEvent(ws, {
        type: "ide.search.cancelled",
        requestId: command.requestId,
        payload: {
          projectId: command.payload.projectId,
          searchRequestId: command.payload.searchRequestId
        }
      });
      return;
    }
case "ide.git.status": {
      const project = runtime.getProject(command.payload.projectId);
      const service = createIdeProjectService();
      try {
        const result = await service.gitStatus(project.rootPath);
        sendEvent(ws, {
          type: "ide.git.status",
          requestId: command.requestId,
          payload: {
            projectId: project.id,
            branch: result.branch,
            isRepository: result.isRepository,
            changes: result.changes
          }
        });
      } catch (error) {
        sendCommandRejected(ws, "IDE git status failed", error instanceof Error ? error.message : "Unknown IDE git status error", command.requestId);
      }
      return;
    }
    default:
      throw new Error(`Unsupported projects command: ${command.type}`);
  }
}
