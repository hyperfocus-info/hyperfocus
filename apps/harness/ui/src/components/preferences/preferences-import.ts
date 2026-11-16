import { z } from "zod";

const preferencesImportSchema = z.object({
  providerBrand: z.enum(["gpt", "gemini", "claude"]).optional(), debugEnabled: z.boolean().optional(),
  tracePanelDefaultOpen: z.boolean().optional(), subagentWorktreeStrategyDefault: z.enum(["same-worktree", "separate-worktrees"]).optional(),
  blockChatOnDirtyGitDefault: z.boolean().optional(), dirtyGitChangeLimitDefault: z.number().optional(),
  autoCompactContextThresholdPercentDefault: z.number().optional(), planExecutionModeDefault: z.enum(["countdown", "approve", "immediate"]).optional(),
  planExecutionDelaySecondsDefault: z.number().optional(), singleAgentModelPreferenceDefault: z.enum(["inference", "intelligence"]).optional(),
  subagentModelPreferenceDefault: z.enum(["inference", "intelligence"]).optional(),
  correctnessIterationModeDefault: z.enum(["ask-before-iterate", "auto-once", "auto-until-clean"]).optional(),
  backgroundJobApprovalPolicyDefault: z.enum(["allow-all", "allow-safe", "ask-risky", "always-ask"]).optional(),
  assistantAutoApproveNonBlockingQuestionsDefault: z.boolean().optional(), assistantCongestionControlEnabledDefault: z.boolean().optional(),
  assistantMaxCongestionDefault: z.number().optional(), maxBackgroundJobsDefault: z.number().optional(),
  autoArchiveCompletedThreadsDefault: z.boolean().optional(), backgroundJobNotificationsEnabled: z.boolean().optional(),
  memoryBankEnabledDefault: z.boolean().optional(), memoryBankRecordRunsDefault: z.boolean().optional(), checkCliUpdatesDefault: z.boolean().optional(),
  selectedReasoningStrength: z.enum(["low", "medium", "high", "extra-high"]).optional(), selectedFastMode: z.boolean().optional(),
  appHotkeyPreferences: z.unknown().optional(), themePreference: z.unknown().optional(), numericRightAlignmentEnabled: z.boolean().optional(),
  experienceMode: z.enum(["simple", "advanced"]).optional()
});

export function parsePreferencesImport(text: string) {
  const parsed = preferencesImportSchema.parse(JSON.parse(text));
  if (!Object.keys(parsed).length) throw new Error("No recognized preferences found. Export a preferences file from Harness, then try again.");
  return parsed;
}
