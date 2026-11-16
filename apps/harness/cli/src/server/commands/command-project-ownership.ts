import type { Assistant, ClientCommand } from "@hyperfocus/ai-core/protocol";
import { drainBrowserApprovalRuntimeRecovery } from "../execution/browser-approval-waiters";

export type CommandProjectOwnership =
  | { kind: "all-projects" }
  | { kind: "projects"; projectIds: Set<string> };

export interface CommandOwnershipRepository {
  getAssistant(id: string): Pick<Assistant, "projectId"> | undefined;
  findProjectIdByRootPath(rootPath: string): string | undefined;
}

export function drainCommandRuntimeRecovery(command: ClientCommand, repository: CommandOwnershipRepository,
  runtime: object) {
  const ownership = resolveCommandProjectOwnership(command, repository);
  if (ownership.kind === "all-projects") drainBrowserApprovalRuntimeRecovery(runtime);
  else for (const projectId of ownership.projectIds) drainBrowserApprovalRuntimeRecovery(runtime, projectId);
}

export function resolveCommandProjectOwnership(
  command: ClientCommand,
  repository: CommandOwnershipRepository,
): CommandProjectOwnership {
  switch (command.type) {
    case "execution.pause-all":
    case "execution.resume-all":
    case "background-job.pause-assistant-jobs":
    case "background-job.scheduler.retry":
    case "memory.inspect":
    case "memory.update":
    case "memory.delete":
      return allProjects();
    case "thread.cleanupArchive":
      return command.payload.projectIds === undefined
        ? allProjects() : projects(command.payload.projectIds);
    case "bulk-operation.preview":
    case "bulk-operation.apply": {
      const ids: string[] = [];
      for (const target of command.payload.targets) {
        if (target.kind === "assistant") {
          const projectId = lookupAssistantProject(repository, target.assistantId);
          if (!projectId) return allProjects();
          ids.push(projectId);
        } else ids.push(target.projectId);
      }
      return projects(ids);
    }
    case "assistant.update": {
      const requested = command.payload.assistant.projectId;
      const current = lookupAssistantProject(repository, command.payload.assistant.id);
      return requested && current ? projects([current, requested]) : allProjects();
    }
    case "assistant.create":
      return command.payload.assistant.projectId
        ? projects([command.payload.assistant.projectId]) : noProjects();
    case "background-job.save":
      return projects([command.payload.job.projectId]);
    case "project.add":
    case "project.create": {
      try {
        const projectId = repository.findProjectIdByRootPath(command.payload.rootPath);
        return projectId ? projects([projectId]) : noProjects();
      } catch { return allProjects(); }
    }
    case "assistant.delete":
    case "assistant.pause":
    case "assistant.resume":
    case "assistant.inspect":
    case "assistant.detail.get":
    case "assistant.workloads.list":
    case "assistant.thread.messages.list":
    case "assistant.logs.list":
    case "assistant.todos.list":
    case "assistant.learnings.list":
    case "assistant.questions.list":
    case "assistant.bootstrap.retry":
    case "assistant.circuit-breaker.retry":
    case "assistant.chat.send":
    case "assistant.question.answer":
    case "assistant.question.answer-batch":
    case "assistant.todo.update":
    case "assistant.todo.delete":
    case "assistant.todo.reorder":
    case "assistant.learning.delete":
    case "assistant.learning.reorder": {
      const projectId = lookupAssistantProject(repository, command.payload.assistantId);
      return projectId ? projects([projectId]) : allProjects();
    }
    case "assistant.jobs.bootstrap": {
      const current = lookupAssistantProject(repository, command.payload.assistantId);
      return current && command.payload.projectId
        ? projects([current, command.payload.projectId]) : allProjects();
    }
    case "assistant.clone-to-project": {
      const current = lookupAssistantProject(repository, command.payload.assistantId);
      return current ? projects([current, command.payload.projectId]) : allProjects();
    }
    case "project.git.initBaseline":
    case "project.remove":
    case "project.activate":
    case "workspace.projectChildren.list":
    case "ide.fileTree.list":
    case "ide.file.read":
    case "ide.file.write":
    case "ide.search.run":
    case "ide.search.cancel":
    case "ide.git.status":
    case "thread.create":
    case "thread.message":
    case "thread.input":
    case "thread.activate":
    case "thread.fork":
    case "thread.rename":
    case "thread.pin":
    case "thread.archive":
    case "thread.restore":
    case "session.reset":
    case "chat.stop":
    case "chat.send":
    case "planning.refine":
    case "planning.answer-batch":
    case "planning.answer":
    case "run.execute":
    case "run.complete":
    case "experiment.inspect":
    case "experiment.promote":
    case "experiment.discard":
    case "branchfs.cleanup":
    case "memory.create":
    case "memory.list":
    case "memory.reorder":
    case "run.detail.get":
    case "run.resume":
    case "run.retry":
    case "run.refresh":
    case "background-job.delete":
    case "background-job.pause":
    case "background-job.resume":
    case "background-job.run-now":
    case "background-job.source.open":
    case "background-job.stop-run":
    case "background-job.retry-run":
    case "background-job.approve-run":
    case "background-job.reject-run":
    case "assistant.create-from-thread":
    case "cli-session.start":
    case "cli-session.stop":
    case "cli-session.resize":
    case "cli-session.attach":
    case "cli-session.capture-visible-buffer":
    case "project.mode.select":
    case "project.context.save":
    case "browser.approval.resolve":
      return projects([command.payload.projectId]);
    case "connection.ping":
    case "notifications.page.list":
    case "notification.mark-read":
    case "notifications.mark-all-read":
    case "cli-updates.check":
    case "cli-updates.install":
    case "agent.list":
    case "usage.refresh":
    case "usage.reset":
    case "agent.runtime.refresh":
    case "setup.refresh":
    case "terminal.shells.list":
    case "terminal.sessions.list":
    case "terminal.history.list":
    case "terminal.session.create":
    case "terminal.session.set-input-override":
    case "terminal.session.rename":
    case "terminal.session.stop":
    case "terminal.session.close":
    case "terminal.session.restart":
    case "terminal.session.resize":
    case "terminal.session.attach":
    case "terminal.preferences.save":
    case "project.browse":
    case "project.search":
    case "workspace.projects.list":
    case "background-jobs.page.list":
    case "assistant.summary.list":
    case "workspace.context.save":
    case "preferences.save":
    case "preferences.testProviderConnection":
    case "preferences.clearApiKey":
    case "run-diagnostics.inspect":
    case "background-job.schedule.preview":
      return noProjects();
    case "mode.save":
    case "mode.delete":
      return command.payload.projectId ? projects([command.payload.projectId]) : noProjects();
  }
  return assertNever(command);
}

function lookupAssistantProject(repository: CommandOwnershipRepository, assistantId: string) {
  try { return repository.getAssistant(assistantId)?.projectId; }
  catch { return undefined; }
}
function projects(projectIds: Iterable<string>): CommandProjectOwnership {
  return { kind: "projects", projectIds: new Set(projectIds) };
}
function noProjects(): CommandProjectOwnership { return projects([]); }
function allProjects(): CommandProjectOwnership { return { kind: "all-projects" }; }
function assertNever(value: never): never { throw new Error(`Unhandled command ownership: ${String(value)}`); }
