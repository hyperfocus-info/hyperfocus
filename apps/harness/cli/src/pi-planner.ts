import {
plannerTurnResultSchema,
providerModelIdSchema,
type ChatMessage,
type ComposerReasoningStrength,
type ModeDefinition,
type PlannerTurnResult,
type PlanningQuestion,
type ProjectContextUsage,
type ProviderBrand,
type ProviderModelId,
type RunPromptStats,
type WorkspaceRuleSource
} from "@hyperfocus/ai-core/protocol";
import { isRecord as isUnknownRecord } from "@hyperfocus/utilities/records";
import { ZodError,type ZodIssue } from "zod";
import { buildPromptAttachmentContext } from "./chat-attachment-prompt";
import { assembleDeterministicPrompt } from "./deterministic-prompt";
import type { GeminiCachedAttachmentContext } from "./gemini-cached-contents";
import { buildGitRepositoryPromptContext } from "./git-context";
import type { PiAgentAdapter,PiAgentPromptRequest } from "./pi-agent-adapter";
import { projectDiscoveryPrompt } from "./project-discovery/inspect";
import type { PromptCacheIdentity } from "./prompt-cache";
import { DEFAULT_CODING_STACK_GUIDANCE } from "./prompts/coding-stack-defaults";
import { taskDesignGuidance } from "./prompts/design-guidance";
import { resolveSubagentModelId } from "./subagent-defaults";
import { buildWorkspacePathGuidance,normalizeWorkspaceRelativePaths } from "./workspace-path-intent";

export const GPT_DEFAULT_PLANNING_MODEL_ID = "openai/gpt-5.4";
export const GPT_DEFAULT_EXECUTION_MODEL_ID = "openai/gpt-5.4";
export const GPT_DEFAULT_SUBAGENT_MODEL_ID = "openai/gpt-5.4-nano";
export const GEMINI_DEFAULT_PLANNING_MODEL_ID = "google/gemini-3-flash-preview";
export const GEMINI_DEFAULT_EXECUTION_MODEL_ID = "google/gemini-2.5-flash";
export const GEMINI_DEFAULT_SUBAGENT_MODEL_ID = "google/gemini-2.5-flash-lite";
export const CLAUDE_DEFAULT_PLANNING_MODEL_ID = "anthropic/claude-opus-4-6";
export const CLAUDE_DEFAULT_EXECUTION_MODEL_ID = "anthropic/claude-sonnet-4-6";
export const CLAUDE_DEFAULT_SUBAGENT_MODEL_ID = "anthropic/claude-haiku-4-5";

type PromptContextUsage = Awaited<ReturnType<PiAgentAdapter["runPrompt"]>>["contextUsage"];

function createPlannerContextUsage(contextUsage: PromptContextUsage, modelId: ProviderModelId): ProjectContextUsage | undefined {
  return contextUsage ? {
    sourceKind: "planner",
    sourceLabel: "planner",
    modelId,
    tokens: contextUsage.tokens,
    inputTokens: Math.max(0, contextUsage.sessionStats.tokens.total - contextUsage.sessionStats.tokens.output),
    contextWindow: contextUsage.contextWindow,
    usagePercent: contextUsage.usagePercent,
    totalProcessedTokens: contextUsage.sessionStats.tokens.total,
    cachedInputTokens: contextUsage.cachedInputTokens,
    updatedAt: new Date().toISOString()
  } : undefined;
}

export async function planTask(
  adapter: PiAgentAdapter,
  options: {
    cwd: string;
    messages: ChatMessage[];
    latestUserPrompt: string;
    providerBrand: ProviderBrand;
    planningModelId?: ProviderModelId;
    executionModelId?: ProviderModelId;
    mode?: ModeDefinition;
    ruleSources?: WorkspaceRuleSource[];
    memorySearch?: PiAgentPromptRequest["memorySearch"];
    priorQuestions?: PlanningQuestion[];
    reasoningStrength?: ComposerReasoningStrength;
    fastMode?: boolean;
    promptCacheIdentity?: PromptCacheIdentity;
    geminiCachedAttachmentContext?: GeminiCachedAttachmentContext;
    abortSignal?: AbortSignal;
  }
): Promise<{ plannerResult: PlannerTurnResult; contextUsage?: ProjectContextUsage; promptStats: RunPromptStats }> {
  const requestedExecutionModelId = options.executionModelId ?? getDefaultExecutionModelId(options.providerBrand);
  const planningModelId = options.planningModelId ?? getDefaultPlanningModelId(options.providerBrand);
  const attachmentContext = await buildPromptAttachmentContext(options.messages, {
    geminiCachedAttachmentContext: options.geminiCachedAttachmentContext
  });
  const workspacePathGuidance = buildWorkspacePathGuidance(options.latestUserPrompt, options.cwd);
  const normalizedLatestUserPrompt = normalizeWorkspaceRelativePaths(options.latestUserPrompt, options.cwd);
  let latestMessage: ChatMessage | undefined;
  for (let index = options.messages.length - 1; index >= 0; index -= 1) {
    if (options.messages[index]!.role !== "system") {
      latestMessage = options.messages[index];
      break;
    }
  }
  const transcriptIncludesLatestTask = latestMessage?.role === "user"
    && normalizeWorkspaceRelativePaths(latestMessage.content, options.cwd) === normalizedLatestUserPrompt;
  const hasAttachments = options.messages.some((message) => message.role !== "system" && message.attachments?.length);
  const prompt = assembleDeterministicPrompt([
    {
      kind: "system",
      content: [
        "You are the planning stage for a local coding harness.",
        taskDesignGuidance({ task: options.latestUserPrompt }),
        "Return JSON only. Do not wrap it in markdown fences.",
        "Schema:",
        `{"type":"question","summary":"","questions":[{"id":"question-1","prompt":"","placeholder":"","choices":[{"id":"choice-1","label":"","description":"","answerText":"","recommended":true},{"id":"choice-2","label":"","description":"","answerText":"","recommended":false},{"id":"choice-3","label":"","description":"","answerText":"","recommended":false}],"required":true}]}`,
        `{"type":"ready","difficultyScore":0,"summary":"","executionModelId":"${requestedExecutionModelId}","usesSubagents":false,"subtasks":[{"id":"task-1","title":"","instruction":""}],"finalExecutionBrief":"","prerequisites":[{"id":"setup-1","title":"","instruction":"","reason":"","requiredForTaskIds":["task-1"],"owner":"main","status":"pending"}],"contracts":[{"taskId":"task-1","title":"","instruction":"","effortPoints":3,"ownedPaths":["src/example.ts"],"dependsOnPrerequisiteIds":[],"deliverables":[""],"integrationPoints":[""],"verificationScope":"owned-files-only","verificationCommands":["bun run typecheck"],"mergeNotes":""}]}`,
        "",
        "Rules:",
        "- Ask only when missing information would materially change the plan or execution target.",
        "- If multiple blockers exist, batch all related blocking questions in one type=question response instead of asking turn-by-turn.",
        "- question.required must always be true.",
        "- questions must contain 1 to 5 items.",
        "- Each question.choices must contain exactly three options.",
        "- Exactly one question choice must set recommended=true.",
        "- Each choice must include concrete answerText that can be sent back verbatim.",
        "- difficultyScore must be an integer from 0 to 100.",
        "- usesSubagents must be true only when difficultyScore is greater than 40.",
        "- executionModelId must be provider-qualified.",
        "- Do not emit usesSubagents=true or non-empty subtasks while any required question remains unanswered.",
        "- subtasks must be empty when usesSubagents is false.",
        "- subtasks must be specific and independent when usesSubagents is true.",
        "- Decompose independent work with clear ownership and acceptance boundaries; leave local implementation choices to the responsible worker.",
        "- When usesSubagents is true, emit contracts with concrete ownedPaths whenever possible.",
        "- Each contract must state the outcome, owned paths, acceptance evidence, and any cross-worker interfaces that must remain compatible.",
        "- Contract deliverables must name concrete files, exported symbols, UI states, or behavior the subagent must produce.",
        "- Contract integrationPoints must name the sibling files, imports, call sites, or runtime surfaces the main agent will merge or verify.",
        "- Workers validate their changed behavior; contract verificationCommands are the host's independent acceptance pass. Avoid duplicate broad suites.",
        "- For substantial work include supervision: {request: exact latest user request, intent, outcome, experience, evidence: [observable acceptance], constraints: [preserved properties], budget: justified effort and stopping conditions, decision: continue|redirect|stop|escalate, reason}. Optional deadlineAt is an authorized absolute Unix-millisecond budget, never an invented limit. Omit supervision for trivial work.",
        "- Each supervised contract includes contribution: {outcome: exact parent outcome, limitingFactor, evidence: observed basis for choosing this intervention, expectedImprovement, stopWhen}. Existing effortPoints, deliverables, verificationCommands and mergeNotes carry cost, completion and integration. Child completion is evidence, never parent acceptance.",
        "- Use continue only for causally relevant work worth its cost. Otherwise redirect, stop or escalate; the host prevents dispatch. Put required pilot/domain acceptance in prerequisite verificationCommands before expensive expansion. Tests/render completion/model ratings cannot establish qualitative acceptance.",
        "- For repeated work, use relevant prior evidence in finalExecutionBrief: strongest existing result and owning implementation, accepted properties to preserve, one known failure, and the unresolved gap. Mark missing evidence explicitly; do not invent approval. Reuse learned checks at the actual caller before expansion and distinguish better defect detection from better output.",
        "- Resolve verification from the actual project declarations and owning instructions. If none is established, keep verificationCommands empty and state the missing verification in mergeNotes; never invent Bun/TypeScript checks for another stack.",
        "- Contract verificationScope must be exactly \"owned-files-only\" or \"worktree-full\". Use \"worktree-full\" for full app, full workspace, or whole project checks.",
        "- Every prerequisite requires verificationCommands: concrete setup acceptance commands executed by the host before dependent work. Keep status pending; model claims cannot complete prerequisites.",
        "- prerequisites[].owner must be exactly \"main\" or \"subagent\".",
        "- Use prerequisites[].owner=\"main\" for independently verifiable setup shared by multiple workers or explicitly required before implementation. Keep routine repository inspection and scaffolding inside finalExecutionBrief for single-agent work; a self-contained single-file product normally needs prerequisites: [].",
        "- Never emit \"user\", \"human\", \"developer\", \"assistant\", \"executor\", or \"agent\" as a prerequisite owner.",
        "- Every enum field must use one of the exact schema literals shown.",
        "- Same-worktree parallel work requires contracts with non-overlapping ownedPaths.",
        "- For greenfield apps with multiple workers, use prerequisites only for shared scaffold/setup those workers depend on, then split subagents by concrete files or folders.",
        `- ${DEFAULT_CODING_STACK_GUIDANCE}`,
        "- Use the active project's test tools and helpers. For a new Bun UI project, Bun plus Happy DOM is an option for component tests; choose browser checks for behavior that needs a real browser.",
        "- Reuse existing UI components. Add shared primitives or setup tasks only when the requested work has concrete consumers for them.",
        "- For new directories, include the first file each subagent should create so implementation can start without extra discovery.",
        "- If paths are genuinely ambiguous, keep subagent contracts but use ownedPaths [\"(planner-unspecified)\"]; execution will upgrade to isolated worktrees.",
        `- Use ${requestedExecutionModelId} unless the user explicitly requires another execution model from the same provider family.`
      ]
    },
    {
      kind: "workspace",
      content: [
        options.mode
      ? [
          "Active mode:",
          `- ${options.mode.label}: ${options.mode.description}`,
          `- Planner guidance: ${options.mode.plannerPrompt}`,
          `- Execution guidance: ${options.mode.executionPrompt}`,
          `- Tool policy: ${options.mode.toolPolicy}`
        ].join("\n")
      : "",
    options.ruleSources && options.ruleSources.length > 0
      ? ["Rule sources:", ...options.ruleSources.map((rule) => `[${rule.scope}] ${rule.label}: ${rule.content}`)].join("\n")
      : "",
        buildGitRepositoryPromptContext(options.cwd),
        projectDiscoveryPrompt(options.cwd),
        workspacePathGuidance ?? ""
      ]
    },
    {
      kind: "attachments",
      content: hasAttachments ? attachmentContext.transcript : undefined
    },
    {
      kind: "dynamic",
      content: [
        hasAttachments ? undefined : "Conversation transcript:",
        hasAttachments ? undefined : attachmentContext.transcript,
        "",
        "Prior planning Q/A:",
        formatPlanningQuestions(options.priorQuestions ?? []),
        transcriptIncludesLatestTask ? undefined : `Latest user task delta: ${summarizeLatestTask(normalizedLatestUserPrompt)}`
      ]
    }
  ]);
  const promptStats = createPromptStats(prompt, attachmentContext.transcript, normalizedLatestUserPrompt);

  const result = await adapter.runPrompt({
    kind: "planner",
    cwd: options.cwd,
    modelId: planningModelId,
    prompt,
    images: attachmentContext.images,
    cacheableUserBlocks: attachmentContext.cacheableUserBlocks,
    promptCacheIdentity: options.promptCacheIdentity,
    geminiCachedContentName: options.geminiCachedAttachmentContext?.cachedContentName,
    reasoningStrength: options.reasoningStrength,
    fastMode: options.fastMode,
    abortSignal: options.abortSignal,
    readOnly: true,
    memorySearch: options.memorySearch
  });

  let rawPayload: unknown;
  try {
    rawPayload = parseJsonPayload(result.text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw createInvalidJsonPlannerError(`Planner returned invalid JSON: ${error.message}`);
    }
    throw error;
  }

  try {
    const parsed = normalizePlannerWorkspacePaths(parsePlannerTurnPayload(rawPayload), options.cwd);
    return {
      plannerResult: parsed,
      promptStats,
      contextUsage: createPlannerContextUsage(result.contextUsage, planningModelId)
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const repairResult = await adapter.runPrompt({
        kind: "planner",
        cwd: options.cwd,
        modelId: planningModelId,
        prompt: buildPlannerRepairPrompt(prompt, rawPayload, error),
        images: attachmentContext.images,
        cacheableUserBlocks: attachmentContext.cacheableUserBlocks,
        promptCacheIdentity: options.promptCacheIdentity,
        geminiCachedContentName: options.geminiCachedAttachmentContext?.cachedContentName,
        reasoningStrength: options.reasoningStrength,
        fastMode: options.fastMode,
        abortSignal: options.abortSignal,
        readOnly: true,
        memorySearch: options.memorySearch
      });

      try {
        rawPayload = parseJsonPayload(repairResult.text);
        const parsed = normalizePlannerWorkspacePaths(parsePlannerTurnPayload(rawPayload), options.cwd);
        return {
          plannerResult: parsed,
          promptStats: createPromptStats(buildPlannerRepairPrompt(prompt, rawPayload, error), attachmentContext.transcript, normalizedLatestUserPrompt),
          contextUsage: createPlannerContextUsage(repairResult.contextUsage, planningModelId)
        };
      } catch (repairError) {
        if (repairError instanceof ZodError) {
          throw createInvalidJsonPlannerError(
            `Planner returned invalid JSON payload after repair: ${formatZodIssues(repairError.issues)}`
          );
        }

        if (repairError instanceof SyntaxError) {
          throw createInvalidJsonPlannerError(`Planner repair returned invalid JSON: ${repairError.message}`);
        }

        throw repairError;
      }
    }

    throw error;
  }
}

function parsePlannerTurnPayload(input: unknown) {
  return plannerTurnResultSchema.parse(normalizePlannerPayload(input));
}

function buildPlannerRepairPrompt(originalPrompt: string, invalidPayload: unknown, error: ZodError) {
  return [
    "Repair the planner JSON payload so it exactly matches the schema.",
    "Return JSON only. Do not wrap it in markdown fences.",
    "Do not change the user intent, task ids, paths, or model ids unless required by the schema.",
    "Use exact enum literals from the schema. In particular, prerequisite owner must be \"main\" or \"subagent\" only.",
    "",
    "Validation errors:",
    formatZodIssues(error.issues),
    "",
    "Invalid payload:",
    JSON.stringify(invalidPayload, null, 2),
    "",
    "Original planner instructions:",
    originalPrompt
  ].join("\n");
}

function createInvalidJsonPlannerError(message: string) {
  return new Error(`${message} [category=invalid-json]`);
}

function formatZodIssues(issues: ZodIssue[]) {
  return issues.map(formatZodIssue).join("; ");
}

function formatZodIssue(issue: ZodIssue) {
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  if (issue.code === "invalid_enum_value") {
    return `${path}: expected ${issue.options.map((option) => JSON.stringify(option)).join(" | ")}, received ${JSON.stringify(issue.received)}`;
  }

  return `${path}: ${issue.message}`;
}

function formatPlanningQuestions(questions: PlanningQuestion[]) {
  if (questions.length === 0) {
    return "(none)";
  }

  return questions
    .map((question) =>
      [
        `Question: ${question.prompt}`,
        question.answerText ? `Answer: ${question.answerText}` : "Answer: (pending)"
      ].join("\n")
    )
    .join("\n\n");
}

function parseJsonPayload(input: string) {
  const trimmed = input.trim();
  const unfenced = unwrapMarkdownFences(trimmed);

  try {
    return JSON.parse(unfenced);
  } catch (error) {
    const extracted = extractFirstJsonPayload(unfenced);
    if (!extracted) {
      throw error;
    }

    return JSON.parse(extracted);
  }
}

function unwrapMarkdownFences(input: string) {
  if (!input.startsWith("```")) {
    return input;
  }

  const lines = input.split(/\r?\n/);
  if (lines.length >= 2 && lines.at(-1)?.startsWith("```")) {
    return lines.slice(1, -1).join("\n").trim();
  }

  return lines.filter((line) => !line.startsWith("```")).join("\n").trim();
}

function extractFirstJsonPayload(input: string) {
  let startIndex = -1;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === "{" || character === "[") {
      startIndex = index;
      break;
    }
  }
  if (startIndex < 0) {
    return undefined;
  }

  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let index = startIndex; index < input.length; index += 1) {
    const character = input[index]!;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{" || character === "[") {
      stack.push(character);
      continue;
    }

    if (character === "}" || character === "]") {
      const opener = stack.pop();
      if (!opener) {
        return undefined;
      }

      if ((opener === "{" && character !== "}") || (opener === "[" && character !== "]")) {
        return undefined;
      }

      if (stack.length === 0) {
        return input.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

export const testExports = {
  parseJsonPayload,
  parsePlannerTurnPayload,
  normalizePlannerPayload,
  normalizePlannerPrerequisiteOwner,
  normalizePlannerPrerequisites,
  normalizePlannerWorkspacePaths
};

function normalizePlannerPayload(input: unknown) {
  const normalized = normalizePlannerPrerequisites(normalizePlannerVerificationScopes(input));
  if (isUnknownRecord(normalized)) {
    const payload = normalized;
    if (payload.type === "question") {
      const questions = Array.isArray(payload.questions)
        ? payload.questions
        : payload.question
          ? [payload.question]
          : [];
      if (questions.length > 0) {
        return {
          ...payload,
          question: payload.question ?? questions[0],
          questions
        };
      }
    }
  }
  if (
    normalized &&
    typeof normalized === "object" &&
    !("type" in normalized) &&
    "difficultyScore" in normalized &&
    "executionModelId" in normalized
  ) {
    return {
      type: "ready",
      ...normalized
    };
  }

  return normalized;
}

function summarizeLatestTask(value: string) {
  return value.length <= 600 ? value : `${value.slice(0, 600)}...`;
}

function createPromptStats(prompt: string, transcript: string, latestTask: string): RunPromptStats {
  return {
    promptChars: prompt.length,
    promptHash: Bun.hash(prompt).toString(16),
    transcriptChars: transcript.length,
    latestTaskChars: latestTask.length
  };
}

function normalizePlannerPrerequisites(input: unknown): unknown {
  if (!isUnknownRecord(input)) {
    return input;
  }

  const payload = input;
  if (!Array.isArray(payload.prerequisites)) {
    return input;
  }

  return {
    ...payload,
    prerequisites: payload.prerequisites.map((prerequisite) => {
      if (!isUnknownRecord(prerequisite)) {
        return prerequisite;
      }

      const prerequisiteRecord = prerequisite;
      return {
        ...prerequisiteRecord,
        owner: normalizePlannerPrerequisiteOwner(prerequisiteRecord.owner),
        status: prerequisiteRecord.status ?? "pending"
      };
    })
  };
}

function normalizePlannerPrerequisiteOwner(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["user", "human", "developer", "assistant", "executor", "agent"].includes(normalized)) {
    return "main";
  }

  if (["sub-agent", "sub_agent", "worker"].includes(normalized)) {
    return "subagent";
  }

  return value;
}

function normalizePlannerVerificationScopes(input: unknown): unknown {
  if (!isUnknownRecord(input)) {
    return input;
  }

  const payload = input;
  if (!Array.isArray(payload.contracts)) {
    return input;
  }

  return {
    ...payload,
    contracts: payload.contracts.map((contract) => {
      if (!isUnknownRecord(contract)) {
        return contract;
      }

      const contractRecord = contract;
      return {
        ...contractRecord,
        verificationScope: normalizePlannerVerificationScope(contractRecord.verificationScope)
      };
    })
  };
}

function normalizePlannerVerificationScope(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["full-app", "full", "full-worktree", "whole-app", "whole-project", "workspace", "project"].includes(normalized)) {
    return "worktree-full";
  }

  if (["owned", "owned-files", "files-only"].includes(normalized)) {
    return "owned-files-only";
  }

  return value;
}

function normalizePlannerWorkspacePaths(plannerResult: PlannerTurnResult, cwd: string): PlannerTurnResult {
  if (plannerResult.type !== "ready") {
    return plannerResult;
  }

  return {
    ...plannerResult,
    summary: normalizeWorkspaceRelativePaths(plannerResult.summary, cwd),
    finalExecutionBrief: normalizeWorkspaceRelativePaths(plannerResult.finalExecutionBrief, cwd),
    subtasks: plannerResult.subtasks.map((subtask) => ({
      ...subtask,
      title: normalizeWorkspaceRelativePaths(subtask.title, cwd),
      instruction: normalizeWorkspaceRelativePaths(subtask.instruction, cwd)
    })),
    prerequisites: plannerResult.prerequisites?.map((prerequisite) => ({
      ...prerequisite,
      title: normalizeWorkspaceRelativePaths(prerequisite.title, cwd),
      instruction: normalizeWorkspaceRelativePaths(prerequisite.instruction, cwd),
      reason: normalizeWorkspaceRelativePaths(prerequisite.reason, cwd),
      verificationCommands: prerequisite.verificationCommands?.map(command => normalizeWorkspaceRelativePaths(command, cwd))
    })),
    contracts: plannerResult.contracts?.map((contract) => ({
      ...contract,
      title: normalizeWorkspaceRelativePaths(contract.title, cwd),
      instruction: normalizeWorkspaceRelativePaths(contract.instruction, cwd),
      ownedPaths: contract.ownedPaths.map((ownedPath) => normalizePlannerPathValue(ownedPath, cwd)),
      deliverables: contract.deliverables.map((deliverable) => normalizeWorkspaceRelativePaths(deliverable, cwd)),
      integrationPoints: contract.integrationPoints.map((point) => normalizeWorkspaceRelativePaths(point, cwd)),
      verificationCommands: contract.verificationCommands.map((command) => normalizeWorkspaceRelativePaths(command, cwd)),
      mergeNotes: normalizeWorkspaceRelativePaths(contract.mergeNotes, cwd)
    }))
  };
}

function normalizePlannerPathValue(value: string, cwd: string) {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value.slice(1);
  }

  return normalizeWorkspaceRelativePaths(value, cwd);
}


export function getDefaultPlanningModelId(providerBrand: ProviderBrand): ProviderModelId {
  if (providerBrand === "gemini") {
    return GEMINI_DEFAULT_PLANNING_MODEL_ID;
  }
  if (providerBrand === "claude") {
    return CLAUDE_DEFAULT_PLANNING_MODEL_ID;
  }
  return GPT_DEFAULT_PLANNING_MODEL_ID;
}

export function getDefaultExecutionModelId(providerBrand: ProviderBrand): ProviderModelId {
  if (providerBrand === "gemini") {
    return GEMINI_DEFAULT_EXECUTION_MODEL_ID;
  }
  if (providerBrand === "claude") {
    return CLAUDE_DEFAULT_EXECUTION_MODEL_ID;
  }
  return GPT_DEFAULT_EXECUTION_MODEL_ID;
}

export function getDefaultSubagentModelId(
  providerBrand: ProviderBrand,
  executionModelId?: ProviderModelId | string
): ProviderModelId {
  return providerModelIdSchema.parse(resolveSubagentModelId({
    agentId: "pi",
    providerBrand,
    executionModelId
  }));
}
