import {
  createBackgroundJobId,
  createThreadId,
  type Assistant,
  type AssistantQuestion,
  type BackgroundJobSchedule,
  type ProjectId
} from "@hyperfocus/ai-core/protocol";
import { previewBackgroundJobSchedule } from "./background-job-schedule";
import { createStableBoundedId } from "./notification-ids";
import { DEFAULT_CODING_STACK_GUIDANCE } from "./prompts/coding-stack-defaults";
import type { WorkspaceRepository } from "./workspace-repository";
import { compileAssistantIntentContract, renderIntentContractPrompt } from "@hyperfocus/ai-core/intent-contract";

export const ASSISTANT_JOB_BOOTSTRAP_DELAY_MS = 600000;
export const ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX = "assistant-job-bootstrap";
export const ASSISTANT_JOB_BOOTSTRAP_SCHEDULE_INPUT = "15m";

export function createAssistantJobBootstrapQuestionId(assistantId: string) {
  return createStableBoundedId([ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX, assistantId]);
}

export function isAssistantJobBootstrapQuestion(question: Pick<AssistantQuestion, "id">) {
  return question.id.startsWith(`${ASSISTANT_JOB_BOOTSTRAP_QUESTION_PREFIX}:`);
}

export function shouldAskAssistantJobBootstrap(
  repository: WorkspaceRepository,
  assistant: Assistant,
  now: Date = new Date(),
  options: { immediate?: boolean } = {}
) {
  if (assistant.deletedAt || assistant.runState !== "active" || assistant.circuitBreakerState === "tripped") {
    return false;
  }
  if (!options.immediate) {
    const createdAtMs = Date.parse(assistant.createdAt);
    if (!Number.isFinite(createdAtMs) || now.getTime() - createdAtMs < ASSISTANT_JOB_BOOTSTRAP_DELAY_MS) {
      return false;
    }
  }
  if (repository.hasAssistantBackgroundJobs(assistant.id)) {
    return false;
  }
  return repository.getAssistantQuestion(createAssistantJobBootstrapQuestionId(assistant.id)) === undefined;
}

export function buildAssistantJobBootstrapQuestion(assistant: Assistant, status: AssistantQuestion["status"]): AssistantQuestion {
  const now = new Date().toISOString();
  return {
    id: createAssistantJobBootstrapQuestionId(assistant.id),
    assistantId: assistant.id,
    prompt: `Bootstrap default research, todo maintenance, and scoped work jobs for ${assistant.name}?`,
    status,
    askedAt: now
  };
}

export function buildAssistantJobBootstrapJobs(input: {
  assistant: Assistant;
  projectId: ProjectId;
  providerExecutionModelId?: string;
  projectModeId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const schedulePreview = previewBackgroundJobSchedule(ASSISTANT_JOB_BOOTSTRAP_SCHEDULE_INPUT, undefined, now);
  if (!schedulePreview.schedule) {
    throw new Error(schedulePreview.error ?? "Invalid assistant job bootstrap schedule");
  }

  const common = {
    projectId: input.projectId,
    assistantId: input.assistant.id,
    kind: "ai-routine" as const,
    status: "enabled" as const,
    riskLevel: "unsafe" as const,
    schedule: schedulePreview.schedule,
    scheduleInput: ASSISTANT_JOB_BOOTSTRAP_SCHEDULE_INPUT,
    timezone: schedulePreview.timezone,
    nextRunAt: resolveBackgroundJobNextRunAt(schedulePreview.schedule),
    createdAt: nowIso,
    updatedAt: nowIso
  };
  const modeId = input.assistant.modeId ?? input.projectModeId ?? "implement";
  const executionModelId = input.assistant.executionModelId ?? input.providerExecutionModelId;
  const workName = isCodingAssistant(input.assistant) ? "Implement todos" : "Work todos";

  return [
    {
      ...common,
      id: createBackgroundJobId(),
      automationThreadId: createThreadId(),
      lane: "concurrent" as const,
      name: "Research goal",
      description: `${input.assistant.name} recurring job: Research goal.`,
      definition: {
        kind: "ai-routine" as const,
        prompt: buildResearchGoalPrompt(input.assistant),
        modeId,
        executionModelId,
        reasoningStrength: input.assistant.reasoningStrength,
        fastMode: input.assistant.fastMode,
        planExecutionMode: "immediate" as const,
        subagentWorktreeStrategy: "separate-worktrees" as const
      }
    },
    {
      ...common,
      id: createBackgroundJobId(),
      automationThreadId: createThreadId(),
      lane: "exclusive" as const,
      name: "Maintain todos",
      description: `${input.assistant.name} recurring job: Maintain todos.`,
      definition: {
        kind: "ai-routine" as const,
        prompt: buildMaintainTodosPrompt(input.assistant),
        modeId,
        executionModelId,
        reasoningStrength: input.assistant.reasoningStrength,
        fastMode: input.assistant.fastMode,
        planExecutionMode: "immediate" as const,
        subagentWorktreeStrategy: "separate-worktrees" as const
      }
    },
    {
      ...common,
      id: createBackgroundJobId(),
      automationThreadId: createThreadId(),
      lane: "exclusive" as const,
      name: workName,
      description: `${input.assistant.name} recurring job: ${workName}.`,
      definition: {
        kind: "ai-routine" as const,
        prompt: buildImplementTodosPrompt(input.assistant),
        modeId,
        executionModelId,
        reasoningStrength: input.assistant.reasoningStrength,
        fastMode: input.assistant.fastMode,
        planExecutionMode: "immediate" as const,
        subagentWorktreeStrategy: "separate-worktrees" as const
      }
    }
  ];
}

function buildResearchGoalPrompt(assistant: Assistant) {
  return [
    isCodingAssistant(assistant) ? "/market-research" : "Research the requested topic using relevant sources.",
    `Research the goal for ${assistant.name}.`,
    renderAssistantJobScope(assistant),
    ...(isCodingAssistant(assistant) ? [
      "Compare current app, code, docs, README, project notes, and assistant state against market signals for the assistant goal.",
      "Scan existing local skills under `.agents/skills/**/SKILL.md` and identify whether research implies a new reusable skill, an existing skill update, a TypeScript script, or a project todo.",
      "Eagerly build or update TypeScript scripts when research exposes repeatable checks, audits, data extraction, scoring, validation, or workflow automation.",
      "Make small, evidence-backed skill or TypeScript script updates only when clearly scoped and not overlapping with active implementation work; otherwise create or update todos for the script, skill, or product work.",
      "Do not spend the pass only reorganizing docs. If research exposes repeatable work, prefer creating or improving a TypeScript script over prose notes.",
      "If no buildable app/product todo exists, create one that explicitly names the smallest usable app behavior, screen, API, workflow, or code path to build next.",
      DEFAULT_CODING_STACK_GUIDANCE,
      "End with concrete build todos.",
    ] : ["Produce source-backed findings for the requested goal. Research and documentation are valid finished deliverables.",
      "Create follow-up todos only within the assistant goal; do not convert findings into unrequested implementation work."]),
    "",
    "Assistant operating context:",
    assistant.jobPrompt
  ].join("\n");
}

function buildMaintainTodosPrompt(assistant: Assistant) {
  return [
    "Maintain todos.",
    `Clear stale completed or obsolete todos for ${assistant.name}.`,
    renderAssistantJobScope(assistant),
    ...(isCodingAssistant(assistant) ? [
      "Scan assistant todos, learnings, memory, codebase, docs, local skills, and TypeScript scripts.",
      "Rank next work by implementation value.",
      "Keep skill-building, skill-update, or TypeScript-script todos when they improve future work.",
      "Every active todo should name an app/product implementation target, a TypeScript script target, a skill-improvement target, or explain why implementation is blocked.",
      "After the first discovery runs, most active todos should be app-code or automation-code and should expect real file updates.",
      DEFAULT_CODING_STACK_GUIDANCE,
      "Do not spend the pass only reorganizing docs.",
    ] : ["Rank todos by their contribution to the requested goal and keep research or documentation tasks when they satisfy it.",
      "Each todo should name its requested deliverable and evidence. Do not invent a coding target or replace requested documentation with scripts."]),
    "",
    "Assistant operating context:",
    assistant.jobPrompt
  ].join("\n");
}

function buildImplementTodosPrompt(assistant: Assistant) {
  return [
    `Complete the top few actionable todos for ${assistant.name}.`,
    renderAssistantJobScope(assistant),
    ...(isCodingAssistant(assistant) ? [
      "Prefer app/code/product behavior and TypeScript automation scripts over docs-only edits.",
      "Implement skill updates when they are top actionable todos and clearly scoped.",
      "Update documentation after behavior, script, or skill changes as needed.",
      "A successful pass should build or change something real when feasible.",
      DEFAULT_CODING_STACK_GUIDANCE,
      "If top todos are docs-only but the assistant goal implies repeatable work, convert one todo into a TypeScript script or the smallest usable app/product implementation and do that first.",
    ] : ["Produce the requested research, analysis, or documentation and record its evidence and remaining blockers.",
      "Do not replace the user's deliverable with coding or automation. Preserve all explicit read-only constraints."]),
    "",
    "Assistant operating context:",
    assistant.jobPrompt
  ].join("\n");
}

function isCodingAssistant(assistant: Assistant) {
  return compileAssistantIntentContract(assistant).artifactTypes.some((type) => type === "app-code" || type === "automation-code");
}

function renderAssistantJobScope(assistant: Assistant) {
  return [renderIntentContractPrompt(compileAssistantIntentContract(assistant)),
    "Explicit user requirements and exclusions remain authoritative. Apply the routine guidance only within that scope; inferred artifact types do not authorize extra work."
  ].join("\n");
}

function resolveBackgroundJobNextRunAt(schedule: BackgroundJobSchedule) {
  switch (schedule.type) {
    case "one-off":
      return schedule.runAt;
    case "interval":
    case "cron":
      return schedule.nextRunAt;
  }
}
