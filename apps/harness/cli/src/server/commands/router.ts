import { handleAssistantsCommand } from "./assistants";
import { handleBackgroundCommand } from "./background";
import { handleBrowserApprovalCommand } from "./browser-approvals";
import { handleChatSendCommand } from "./chat-send";
import { handlePlanningAnswersCommand } from "./planning-answers";
import { handlePlanningRefineCommand } from "./planning-refine";
import { handlePreferencesCommand } from "./preferences";
import { handleProjectsCommand } from "./projects";
import { handleRunRecoveryCommand } from "./run-recovery";
import { handleRunsCommand } from "./runs";
import { handleSystemCommand } from "./system";
import { handleTerminalsCommand } from "./terminals";
import { handleThreadsCommand } from "./threads";
import type { ServerCommandContext } from "./context";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { drainCommandRuntimeRecovery } from "./command-project-ownership";

export async function handleCommand(
  command: ClientCommand,
  context: ServerCommandContext
) {
  drainCommandRuntimeRecovery(command, context.repository, context.runtime);
  switch (command.type) {
    case "connection.ping":
    case "notifications.page.list":
    case "notification.mark-read":
    case "notifications.mark-all-read":
    case "cli-updates.check":
    case "cli-updates.install":
    case "execution.pause-all":
    case "execution.resume-all":
    case "agent.list":
    case "usage.refresh":
    case "usage.reset":
    case "agent.runtime.refresh":
    case "setup.refresh":
      return handleSystemCommand(command, context);
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
    case "cli-session.start":
    case "cli-session.stop":
    case "cli-session.resize":
    case "cli-session.attach":
    case "cli-session.capture-visible-buffer":
      return handleTerminalsCommand(command, context);
    case "project.add":
    case "project.create":
    case "project.git.initBaseline":
    case "project.browse":
    case "project.remove":
    case "project.activate":
    case "project.search":
    case "workspace.projects.list":
    case "workspace.projectChildren.list":
    case "ide.fileTree.list":
    case "ide.file.read":
    case "ide.file.write":
    case "ide.search.run":
    case "ide.search.cancel":
    case "ide.git.status":
      return handleProjectsCommand(command, context);
    case "thread.create":
    case "thread.message":
    case "thread.input":
    case "thread.activate":
    case "thread.fork":
    case "thread.rename":
    case "thread.pin":
    case "thread.archive":
    case "thread.cleanupArchive":
    case "thread.restore":
    case "session.reset":
    case "chat.stop":
      return handleThreadsCommand(command, context);
    case "chat.send":
      return handleChatSendCommand(command, context);
    case "planning.refine":
      return handlePlanningRefineCommand(command, context);
    case "planning.answer-batch":
    case "planning.answer":
      return handlePlanningAnswersCommand(command, context);
    case "run.execute":
    case "run.complete":
    case "experiment.inspect":
    case "experiment.promote":
    case "experiment.discard":
    case "branchfs.cleanup":
    case "memory.create":
    case "memory.list":
    case "memory.inspect":
    case "memory.update":
    case "memory.reorder":
    case "memory.delete":
    case "run-diagnostics.inspect":
    case "run.detail.get":
      return handleRunsCommand(command, context);
    case "run.resume":
    case "run.retry":
    case "run.refresh":
      return handleRunRecoveryCommand(command, context);
    case "background-job.save":
    case "background-jobs.page.list":
    case "background-job.delete":
    case "background-job.pause":
    case "background-job.pause-assistant-jobs":
    case "background-job.resume":
    case "background-job.run-now":
    case "background-job.source.open":
    case "background-job.scheduler.retry":
    case "background-job.stop-run":
    case "background-job.retry-run":
    case "background-job.approve-run":
    case "background-job.reject-run":
    case "background-job.schedule.preview":
    case "bulk-operation.preview":
    case "bulk-operation.apply":
      return handleBackgroundCommand(command, context);
    case "assistant.create":
    case "assistant.create-from-thread":
    case "assistant.update":
    case "assistant.delete":
    case "assistant.pause":
    case "assistant.resume":
    case "assistant.clone-to-project":
    case "assistant.inspect":
    case "assistant.summary.list":
    case "assistant.detail.get":
    case "assistant.workloads.list":
    case "assistant.thread.messages.list":
    case "assistant.logs.list":
    case "assistant.todos.list":
    case "assistant.learnings.list":
    case "assistant.questions.list":
    case "assistant.bootstrap.retry":
    case "assistant.jobs.bootstrap":
    case "assistant.circuit-breaker.retry":
    case "assistant.chat.send":
    case "assistant.question.answer":
    case "assistant.question.answer-batch":
    case "assistant.todo.update":
    case "assistant.todo.delete":
    case "assistant.todo.reorder":
    case "assistant.learning.delete":
    case "assistant.learning.reorder":
      return handleAssistantsCommand(command, context);
    case "browser.approval.resolve":
      return handleBrowserApprovalCommand(command, context);
    case "project.mode.select":
    case "mode.save":
    case "mode.delete":
    case "workspace.context.save":
    case "project.context.save":
    case "preferences.save":
    case "preferences.testProviderConnection":
    case "preferences.clearApiKey":
      return handlePreferencesCommand(command, context);
  }
}

export const LOG_COMMAND_ERRORS = process.env.NODE_ENV !== "production";
