import type { CliUpdate } from "../../cli-update-checker";
import { createLegacyTruncatedId, createStableBoundedId } from "../../notification-ids";
import type { WorkspaceRepository } from "../../workspace-repository";
import { isTerminalAgentRunStatus, type BackgroundJob, type BackgroundJobRun, type BackgroundRunStatusNotification, type BrowserApprovalNotification, type NotificationSeverity, type PlanningQuestion, type PlanningQuestionBatchNotification, type PlanningQuestionNotification, type WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";

type ServerNotificationRepository = Pick<
  WorkspaceRepository,
  | "archiveNotification"
  | "getBackgroundJob"
  | "loadNotificationInboxState"
  | "loadWorkspace"
  | "saveNotification"
>;

export function syncBrowserApprovalNotifications(repository: ServerNotificationRepository, project?: WorkspaceProjectState) {
  const projects = project ? [project] : repository.loadWorkspace().projects;
  const activeIds = new Set<string>();
  for (const currentProject of projects) {
    for (const run of [currentProject.activeRun, currentProject.lastRun]) {
      if (!run || isTerminalAgentRunStatus(run.status)) {
        continue;
      }

      for (const session of run.browserSessions ?? []) {
        for (const activity of session.activities) {
          const approval = activity.approval;
          if (!approval || (approval.status !== "pending" && approval.status !== "deferred")) {
            continue;
          }

          const notification = createBrowserApprovalNotification(
            currentProject.id,
            run.threadId,
            run.id,
            session.id,
            activity.toolCallId,
            approval.label,
            approval.inputSummary
          );
          activeIds.add(notification.id);
          repository.saveNotification(notification);
        }
      }
    }
  }

  if (!project) {
    for (const item of repository.loadNotificationInboxState().items) {
      if (item.kind !== "browser-approval") {
        continue;
      }

      if (!activeIds.has(item.id)) {
        repository.archiveNotification(item.id);
      }
    }
  }
}

export function saveBackgroundRunStatusNotification(repository: ServerNotificationRepository, run: BackgroundJobRun) {
  const job = repository.getBackgroundJob(run.jobId);
  if (!job) {
    return;
  }

  const notification = createBackgroundRunStatusNotification(job, run);
  if (!notification) {
    return;
  }

  repository.saveNotification(notification);
}

export function saveCliUpdateNotifications(repository: ServerNotificationRepository, updates: CliUpdate[]) {
  let notifications = repository.loadNotificationInboxState();
  for (const update of updates) {
    notifications = repository.saveNotification(createCliUpdateNotification(update));
  }
  return notifications;
}

export function createCliUpdateNotification(update: CliUpdate) {
  return {
    id: createCliUpdateNotificationId(update.agentId, update.latestVersion),
    kind: "cli-update" as const,
    interactive: true as const,
    createdAt: new Date().toISOString(),
    agentId: update.agentId,
    label: update.label,
    currentVersion: update.currentVersion,
    latestVersion: update.latestVersion,
    updateCommand: update.updateCommand
  };
}

function createCliUpdateNotificationId(agentId: string, latestVersion: string) {
  return createStableBoundedId(["cli-update", agentId, latestVersion]);
}

export function getCliUpdateTargetLabel(agentId: string) {
  switch (agentId) {
    case "pi":
      return "Pi";
    case "copilot-cli":
      return "GitHub Copilot CLI";
    case "codex-cli":
      return "Codex CLI";
    case "claude-cli":
      return "Claude Code";
    default:
      return "CLI";
  }
}

export function archiveNotificationWithLegacyId(repository: ServerNotificationRepository, parts: readonly string[]) {
  const id = createStableBoundedId(parts);
  const legacyId = createLegacyTruncatedId(parts);
  repository.archiveNotification(id);
  if (legacyId !== id) {
    repository.archiveNotification(legacyId);
  }
}

export function createPlanningQuestionNotification(
  projectId: string,
  threadId: string,
  runId: string,
  question: PlanningQuestion
): PlanningQuestionNotification {
  return {
    id: createPlanningQuestionNotificationId(runId, question.id),
    kind: "planning-question",
    interactive: true,
    createdAt: new Date().toISOString(),
    projectId,
    threadId,
    runId,
    questionId: question.id,
    prompt: question.prompt,
    placeholder: question.placeholder,
    responseKind: question.responseKind,
    choices: question.choices
  };
}

export function createPlanningQuestionBatchNotification(
  projectId: string,
  threadId: string,
  runId: string,
  questions: PlanningQuestion[]
): PlanningQuestionBatchNotification {
  return {
    id: createPlanningQuestionBatchNotificationId(runId, questions.map((question) => question.id)),
    kind: "planning-question-batch",
    interactive: true,
    createdAt: new Date().toISOString(),
    projectId,
    threadId,
    runId,
    questions: questions.slice(0, 5).map((question) => ({
      questionId: question.id,
      prompt: question.prompt,
      placeholder: question.placeholder,
      responseKind: question.responseKind,
      choices: question.choices
    }))
  };
}

function createPlanningQuestionNotificationId(runId: string, questionId: string) {
  return createStableBoundedId(["planning-question", runId, questionId]);
}

export function createPlanningQuestionBatchNotificationId(runId: string, questionIds: string[]) {
  return createStableBoundedId(["planning-question-batch", runId, ...questionIds]);
}

export function createBrowserApprovalNotification(
  projectId: string,
  threadId: string,
  runId: string,
  sessionId: string,
  toolCallId: string,
  label: string,
  inputSummary?: string
): BrowserApprovalNotification {
  return {
    id: createBrowserApprovalNotificationId(projectId, runId, sessionId, toolCallId),
    kind: "browser-approval",
    interactive: true,
    createdAt: new Date().toISOString(),
    projectId,
    threadId,
    runId,
    sessionId,
    toolCallId,
    label,
    inputSummary
  };
}

function createBrowserApprovalNotificationId(projectId: string, runId: string, sessionId: string, toolCallId: string) {
  return createStableBoundedId(["browser-approval", projectId, runId, sessionId, toolCallId]);
}

export function createBackgroundRunStatusNotification(
  job: BackgroundJob,
  run: BackgroundJobRun
): BackgroundRunStatusNotification | undefined {
  const statusMeta = backgroundRunNotificationMeta(run.status);
  if (!statusMeta) {
    return undefined;
  }
  const summary =
    sanitizeBackgroundNotificationSummary(run.summary) ??
    sanitizeBackgroundNotificationSummary(run.failureMessage) ??
    formatBackgroundApprovalNotificationSummary(job, run) ??
    `${job.name} ${statusMeta.fallbackVerb}`;

  return {
    id: createBackgroundRunStatusNotificationId(run.id),
    kind: "background-run-status",
    interactive: false,
    createdAt: run.updatedAt,
    backgroundRunId: run.id,
    jobId: run.jobId,
    projectId: run.projectId,
    threadId: run.automationThreadId,
    title: statusMeta.title,
    summary,
    severity: statusMeta.severity
  };
}

export function isBackgroundRunNotificationStatus(status: BackgroundJobRun["status"]) {
  return backgroundRunNotificationMeta(status) !== undefined;
}

function createBackgroundRunStatusNotificationId(runId: string) {
  return createStableBoundedId(["background-run-status", runId]);
}

function sanitizeBackgroundNotificationSummary(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }
  if (/# IDENTITY:|# OPERATIONAL LOGIC \(The Job\)|# ACTIVE MISSION \(The Request\)/i.test(value)) {
    return undefined;
  }
  const sanitized = value.replace(/\/caveman\s+ultra/gi, "").replace(/\s+/g, " ").trim();
  return sanitized || undefined;
}

function formatBackgroundApprovalNotificationSummary(job: BackgroundJob, run: BackgroundJobRun) {
  if (run.status !== "awaiting-approval" && run.approvalStatus !== "pending") {
    return undefined;
  }
  return `${job.name} is waiting before launch. Reason: ${run.riskLevel} ${run.triggerSource} run has pending approval.`;
}

function backgroundRunNotificationMeta(
  status: BackgroundJobRun["status"]
): { title: string; severity: NotificationSeverity; fallbackVerb: string } | undefined {
  switch (status) {
    case "awaiting-approval":
      return { title: "Background task needs approval", severity: "warning", fallbackVerb: "needs approval" };
    case "running":
      return { title: "Background task started", severity: "info", fallbackVerb: "started" };
    case "awaiting-user-input":
      return { title: "Background task needs input", severity: "warning", fallbackVerb: "needs input" };
    case "succeeded":
      return { title: "Background task done", severity: "info", fallbackVerb: "finished" };
    case "partial-complete":
      return { title: "Background task partially done", severity: "warning", fallbackVerb: "finished with warnings" };
    case "failed":
      return { title: "Background task failed", severity: "error", fallbackVerb: "failed" };
    case "cancelled":
      return { title: "Background task cancelled", severity: "warning", fallbackVerb: "cancelled" };
    default:
      return undefined;
  }
}
