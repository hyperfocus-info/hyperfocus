import type { ChatMessage, ExecutionPlan } from "@hyperfocus/ai-core/protocol";
import { buildPromptAttachmentContext } from "../chat-attachment-prompt";
import { assembleDeterministicPrompt, boundExecutionTranscript, formatBoundedExecutionTranscript } from "../deterministic-prompt";
import type { GeminiCachedAttachmentContext } from "../gemini-cached-contents";
import { buildGitRepositoryPromptContext } from "../git-context";
import { projectDiscoveryPrompt } from "../project-discovery/inspect";
import { buildWorkspacePathGuidance, normalizeWorkspaceRelativePaths } from "../workspace-path-intent";
import { buildExecutionSkillContext } from "./execution-skill-context";
import { taskDesignGuidance } from "./design-guidance";

export function buildExecutionPrompt(options: { messages: ChatMessage[]; finalExecutionBrief: string; executionPlan?: ExecutionPlan; cwd?: string }) {
  const { messages, finalExecutionBrief, executionPlan, cwd } = options;
  const normalizedFinalExecutionBrief = cwd ? normalizeWorkspaceRelativePaths(finalExecutionBrief, cwd) : finalExecutionBrief;
  return assembleDeterministicPrompt([
    {
      kind: "system",
      content: [
        "You are the execution stage for a local coding harness.",
        "Use the available coding tools when needed and respond with the final assistant answer only.",
        taskDesignGuidance({ task: finalExecutionBrief })
      ]
    },
    {
      kind: "workspace",
      content: cwd ? buildExecutionWorkspaceContext(messages, finalExecutionBrief, executionPlan, cwd) : undefined
    },
    {
      kind: "frozen-plan",
      content: normalizedFinalExecutionBrief
    },
    {
      kind: "dynamic",
      content: [
        "Conversation transcript:",
        formatBoundedExecutionTranscript(messages, { duplicateBrief: finalExecutionBrief })
      ]
    }
  ]);
}

function buildExecutionWorkspaceContext(
  messages: ChatMessage[],
  finalExecutionBrief: string,
  executionPlan?: ExecutionPlan,
  cwd?: string
) {
  const workspacePathGuidance = cwd
    ? buildWorkspacePathGuidance(
        [...messages.filter((message) => message.role === "user").slice(-3).map((message) => message.content), finalExecutionBrief].join(
          "\n"
        ),
        cwd
      )
    : undefined;
  return [
    executionPlan?.supervision ? `Governing outcome and constraints (do not narrow for this phase):\n${JSON.stringify(executionPlan.supervision)}` : "",
    executionPlan?.mode
      ? [
          "Active mode:",
          `- ${executionPlan.mode.label}: ${executionPlan.mode.description}`,
          `- Execution guidance: ${executionPlan.mode.executionPrompt}`,
          `- Tool policy: ${executionPlan.mode.toolPolicy}`
        ].join("\n")
      : "",
    executionPlan?.ruleSources && executionPlan.ruleSources.length > 0
      ? ["Rule sources:", ...executionPlan.ruleSources.map((rule) => `[${rule.scope}] ${rule.label}: ${rule.content}`)].join("\n")
      : "",
    cwd ? buildGitRepositoryPromptContext(cwd) : "",
    cwd ? buildExecutionSkillContext(cwd) : "",
    cwd ? projectDiscoveryPrompt(cwd) : "",
    workspacePathGuidance ?? ""
  ].filter(Boolean).join("\n");
}

export async function buildExecutionInput(options: { cwd: string; messages: ChatMessage[]; finalExecutionBrief: string; executionPlan?: ExecutionPlan; prefix?: string; geminiCachedAttachmentContext?: GeminiCachedAttachmentContext }) {
  const { cwd, messages, finalExecutionBrief, executionPlan, prefix } = options;
  const attachmentContext = await buildPromptAttachmentContext(messages, {
    geminiCachedAttachmentContext: options.geminiCachedAttachmentContext
  });
  const transcript = formatBoundedExecutionTranscript(messages, { duplicateBrief: finalExecutionBrief });
  const attachmentTranscript = boundExecutionTranscript(attachmentContext.transcript);
  const normalizedFinalExecutionBrief = normalizeWorkspaceRelativePaths(finalExecutionBrief, cwd);
  const attachmentsIncludeTranscript = messages.some((message) => Boolean(message.attachments?.length));
  const basePrompt = assembleDeterministicPrompt([
    {
      kind: "system",
      content: [
        "You are the execution stage for a local coding harness.",
        "Use the available coding tools when needed and respond with the final assistant answer only.",
        taskDesignGuidance({ task: finalExecutionBrief })
      ]
    },
    {
      kind: "workspace",
      content: buildExecutionWorkspaceContext(messages, finalExecutionBrief, executionPlan, cwd)
    },
    {
      kind: "attachments",
      content: attachmentsIncludeTranscript ? attachmentTranscript : undefined
    },
    {
      kind: "frozen-plan",
      content: normalizedFinalExecutionBrief
    },
    {
      kind: "dynamic",
      content: attachmentsIncludeTranscript ? undefined : ["Conversation transcript:", transcript]
    }
  ]);
  const prompt = [prefix, prefix ? "" : undefined, basePrompt].filter(Boolean).join("\n");

  return {
    prompt,
    images: attachmentContext.images,
    cacheableUserBlocks: attachmentContext.cacheableUserBlocks
  };
}
